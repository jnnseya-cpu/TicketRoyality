import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { computeOrderFees, toMinor } from '@/shared/fees';
import type { BoxOfficeSale, BoxOfficeTender } from '@/shared/types';

/**
 * Box office — selling a ticket at the door, through the ONE issuance path.
 *
 * A door sale is not a second way to mint a ticket. It writes exactly the `payment_events`
 * document a webhook writes (provider `offline`), and the deployed issuance function turns
 * it into a real, signed, counted QR — so inventory, the oversell guard, the door scanner
 * and refunds all work unchanged, and no buyer account is needed (the ticket is valid by
 * its signature, not by an owner).
 *
 * The platform moves none of the money — the organiser takes cash / card / mobile money in
 * person — so the buyer pays the SAME total as online (face + the customer-side service
 * fee, priced by the same `computeOrderFees` call the checkout uses), and the service fee
 * is recorded as OWED by the organiser, to show on the dashboard and be deducted at payout.
 */

const SALES = 'box_office_sales';
const PINS = 'event_box_office';

/** Server secret for the door PIN HMAC; never the PIN itself in storage. */
function pinSecret(): string {
  return process.env.CRON_SECRET ?? process.env.QR_SIGNING_KEY ?? 'ticketroyality-box-office';
}
function hashPin(eventId: string, pin: string): string {
  return createHmac('sha256', pinSecret()).update(`${eventId}|${pin.trim()}`).digest('hex');
}
function pinMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Organiser sets or rotates the door PIN for one event. Stored only as an HMAC. */
export async function setBoxOfficePin(
  eventId: string,
  organizerId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'Unavailable right now.' };
  const clean = pin.trim();
  if (clean.length < 4) return { ok: false, error: 'Use a PIN of at least 4 characters.' };

  const db = getAdminDb();
  const event = await db.collection('events').doc(eventId).get();
  if (!event.exists || event.data()?.organizerId !== organizerId) {
    return { ok: false, error: 'Event not found.' };
  }
  await db.collection(PINS).doc(eventId).set(
    { pinHash: hashPin(eventId, clean), updatedAt: new Date().toISOString(), updatedBy: organizerId },
    { merge: true }
  );
  return { ok: true };
}

/** Whether a door PIN is set (so the dashboard can show the staff link is armed). */
export async function boxOfficePinSet(eventId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const doc = await getAdminDb().collection(PINS).doc(eventId).get();
  return Boolean(doc.exists && doc.data()?.pinHash);
}

/** Verify a door PIN — the staff link's only key. Fails closed if none is set. */
export async function verifyBoxOfficePin(eventId: string, pin: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const doc = await getAdminDb().collection(PINS).doc(eventId).get();
  const stored = doc.data()?.pinHash;
  if (!stored) return false;
  return pinMatches(String(stored), hashPin(eventId, pin));
}

export interface DoorSaleInput {
  eventId: string;
  tierId: string;
  quantity: number;
  tender: BoxOfficeTender;
  /** 'door' for a PIN sale, or the organiser's uid for a dashboard sale. */
  soldBy: string;
  buyerName?: string;
  buyerEmail?: string;
}

export type DoorSaleResult =
  | { ok: true; saleId: string; buyerTotalMinor: number; serviceFeeMinor: number; currency: string }
  | { ok: false; error: string };

/**
 * Sell at the door. Server-priced from Firestore (never a posted amount), idempotent by a
 * fresh id, and issued through `recordPaymentEvent` so the one function that always issues
 * tickets issues these too.
 */
export async function sellAtDoor(input: DoorSaleInput): Promise<DoorSaleResult> {
  if (!isAdminConfigured()) return { ok: false, error: 'Ticketing is not configured.' };
  const qty = Math.floor(Number(input.quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
    return { ok: false, error: 'Choose between 1 and 50 tickets.' };
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(input.eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return { ok: false, error: 'Event not found.' };
  const event = eventSnap.data() as {
    organizerId: string;
    title: string;
    currency?: string;
    ticketTiers?: Array<{ id: string; name: string; price: number; quantity?: number; sold?: number; currency?: string }>;
  };

  const tier = (event.ticketTiers ?? []).find((t) => t.id === input.tierId);
  if (!tier) return { ok: false, error: 'That ticket type no longer exists.' };

  // Best-effort availability check; the issuance transaction is the real oversell guard,
  // but taking cash for a ticket that cannot issue is exactly what to avoid at a door.
  if (typeof tier.quantity === 'number' && (tier.sold ?? 0) + qty > tier.quantity) {
    const left = Math.max(0, tier.quantity - (tier.sold ?? 0));
    return { ok: false, error: left === 0 ? 'Sold out.' : `Only ${left} left of ${tier.name}.` };
  }

  const currency = tier.currency ?? event.currency ?? 'GBP';
  const faceMinor = toMinor(tier.price);
  // The SAME call the checkout makes, with no options, so a door ticket costs a buyer
  // exactly what the online one does.
  const quote = computeOrderFees([{ faceMinor, qty }]);

  const saleId = `box_${input.eventId}_${randomUUID()}`;

  const outcome = await recordPaymentEvent({
    providerEventId: saleId,
    provider: 'offline',
    providerType: `box_office.${input.tender}`,
    intent: 'issue',
    eventId: input.eventId,
    tierId: input.tierId,
    userId: '', // a walk-up buyer has no account; the ticket is valid by its signature
    quantity: qty,
    price: tier.price,
    currency,
    attendeeName: input.buyerName?.trim() || 'Door sale',
    attendeeEmail: input.buyerEmail?.trim() || '',
    // The refund pointer, so a later reversal can find these tickets (provider 'offline'
    // refunds physically — no external money movement).
    providerRef: saleId,
    feeSnapshot: {
      pricingVersion: quote.pricingVersion,
      feeConfigVersion: quote.configVersion,
      faceMinor: quote.faceMinor,
      serviceFeeMinor: quote.serviceFeeMinor,
      buyerTotalMinor: quote.buyerTotalMinor,
      organiserPayoutMinor: quote.organiserPayoutMinor,
    },
  });

  if (outcome !== 'recorded') {
    return { ok: false, error: 'That sale did not go through — try again.' };
  }

  const sale: BoxOfficeSale = {
    id: saleId,
    organizerId: event.organizerId,
    eventId: input.eventId,
    eventTitle: event.title,
    tierId: input.tierId,
    tierName: tier.name,
    tender: input.tender,
    quantity: qty,
    faceMinor: quote.faceMinor,
    serviceFeeMinor: quote.serviceFeeMinor,
    buyerTotalMinor: quote.buyerTotalMinor,
    feeOwedMinor: quote.serviceFeeMinor,
    currency,
    status: 'issued',
    soldBy: input.soldBy,
    ...(input.buyerName?.trim() ? { buyerName: input.buyerName.trim() } : {}),
    ...(input.buyerEmail?.trim() ? { buyerEmail: input.buyerEmail.trim() } : {}),
    createdAt: new Date().toISOString(),
  };
  await db.collection(SALES).doc(saleId).set(sale);

  return {
    ok: true,
    saleId,
    buyerTotalMinor: quote.buyerTotalMinor,
    serviceFeeMinor: quote.serviceFeeMinor,
    currency,
  };
}

export interface DoorTicket {
  id: string;
  reference: string;
  eventId: string;
  qrSignature?: string;
  attendeeName?: string;
  tierName?: string;
  seat?: string;
  /** 'valid' can be refunded or admitted; 'redeemed' already entered; 'refunded' reversed. */
  status?: string;
}

/**
 * The tickets a door sale issued, for showing the buyer their QR on the spot. Issuance is
 * a beat behind the sale (it runs in the function), so this returns `[]` until the marker
 * exists — the caller polls. Authorised by the sale's own event: the owning organiser, or
 * a valid door PIN for that event.
 */
export async function saleTickets(
  saleId: string,
  auth: { organizerId?: string; pin?: string }
): Promise<{ ok: true; tickets: DoorTicket[] } | { ok: false; error: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'Unavailable right now.' };
  const db = getAdminDb();
  const saleSnap = await db.collection(SALES).doc(saleId).get();
  if (!saleSnap.exists) return { ok: false, error: 'Sale not found.' };
  const sale = saleSnap.data() as BoxOfficeSale;

  const authorised = auth.organizerId
    ? sale.organizerId === auth.organizerId
    : auth.pin
      ? await verifyBoxOfficePin(sale.eventId, auth.pin)
      : false;
  if (!authorised) return { ok: false, error: 'Not authorised.' };

  const marker = await db.collection('issued_payments').doc(saleId).get();
  const ids = (marker.data()?.ticketIds as string[] | undefined) ?? [];
  if (ids.length === 0) return { ok: true, tickets: [] }; // not issued yet — poll again

  const tickets: DoorTicket[] = [];
  for (const id of ids) {
    const t = await db.collection('tickets').doc(id).get();
    if (!t.exists) continue;
    const d = t.data() as Record<string, unknown>;
    tickets.push({
      id,
      reference: String(d.reference ?? ''),
      eventId: String(d.eventId ?? ''),
      qrSignature: d.qrSignature ? String(d.qrSignature) : undefined,
      attendeeName: d.attendeeName ? String(d.attendeeName) : undefined,
      tierName: d.tierName ? String(d.tierName) : undefined,
      seat: d.seat ? String(d.seat) : undefined,
      status: d.status ? String(d.status) : undefined,
    });
  }
  return { ok: true, tickets };
}

/** The organiser's door sales, newest first, with the fee they owe. */
export async function listDoorSales(organizerId: string): Promise<BoxOfficeSale[]> {
  if (!isAdminConfigured()) return [];
  const snap = await getAdminDb()
    .collection(SALES)
    .where('organizerId', '==', organizerId)
    .get();
  return snap.docs
    .map((d) => d.data() as BoxOfficeSale)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Total service fee the organiser owes from door sales still standing (not refunded). */
export function owedFromSales(sales: BoxOfficeSale[]): Record<string, number> {
  const owed: Record<string, number> = {};
  for (const s of sales) {
    if (s.status !== 'issued') continue;
    owed[s.currency] = (owed[s.currency] ?? 0) + s.feeOwedMinor;
  }
  return owed;
}

/**
 * Reverse door-sale tickets — one, or all still-valid ones — directly and synchronously.
 *
 * Mirrors the issuance function's refund exactly (mark valid → refunded, group by each
 * ticket's CURRENT tier, decrement `sold` clamped at zero, never touch a redeemed ticket),
 * but does it in-process so a door refund is instant and needs no async function. No money
 * moves — a box-office sale was cash/card/mobile-money in the organiser's hand — so this
 * only squares the ticket, the inventory and the fee the organiser owes. Idempotent by
 * ticket status: a second refund of the same ticket reverses nothing.
 */
async function reverseDoorTickets(
  saleId: string,
  organizerId: string,
  onlyTicketId?: string
): Promise<{ ok: true; reversed: number } | { ok: false; error: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'Unavailable right now.' };
  const db = getAdminDb();
  const saleRef = db.collection(SALES).doc(saleId);
  const saleSnap = await saleRef.get();
  if (!saleSnap.exists) return { ok: false, error: 'Sale not found.' };
  const sale = saleSnap.data() as BoxOfficeSale;
  if (sale.organizerId !== organizerId) return { ok: false, error: 'Not your sale.' };

  const marker = await db.collection('issued_payments').doc(saleId).get();
  const allIds = (marker.data()?.ticketIds as string[] | undefined) ?? [];
  const targetIds = onlyTicketId ? allIds.filter((id) => id === onlyTicketId) : allIds;
  if (onlyTicketId && targetIds.length === 0) {
    return { ok: false, error: 'That ticket is not part of this sale.' };
  }
  if (targetIds.length === 0) return { ok: true, reversed: 0 };

  const eventRef = db.collection('events').doc(sale.eventId);
  const reversed = await db.runTransaction(async (tx) => {
    const ticketRefs = targetIds.map((id) => db.collection('tickets').doc(id));
    const snaps = await tx.getAll(eventRef, ...ticketRefs);
    const eventSnap = snaps[0];
    let count = 0;
    const perTier: Record<string, number> = {};
    for (const snap of snaps.slice(1)) {
      if (!snap.exists) continue;
      const t = snap.data() as { status?: string; tierId?: string };
      if (t.status !== 'valid') continue; // never reverse a redeemed or already-refunded ticket
      tx.update(snap.ref, { status: 'refunded', refundedAt: new Date().toISOString() });
      count += 1;
      const tierId = t.tierId ?? sale.tierId;
      perTier[tierId] = (perTier[tierId] ?? 0) + 1;
    }
    if (eventSnap.exists && count > 0) {
      const ev = eventSnap.data() as { ticketTiers?: Array<{ id: string; sold?: number }> };
      const tiers = Array.isArray(ev.ticketTiers) ? [...ev.ticketTiers] : [];
      let changed = false;
      for (const [tierId, c] of Object.entries(perTier)) {
        const idx = tiers.findIndex((t) => t.id === tierId);
        if (idx === -1) continue;
        tiers[idx] = { ...tiers[idx], sold: Math.max(0, (tiers[idx].sold ?? 0) - c) };
        changed = true;
      }
      if (changed) tx.update(eventRef, { ticketTiers: tiers });
    }
    return count;
  });

  if (reversed > 0) {
    const perTicketFee = sale.quantity > 0 ? Math.round(sale.serviceFeeMinor / sale.quantity) : 0;
    const refundedCount = (sale.refundedCount ?? 0) + reversed;
    await saleRef.update({
      refundedCount,
      feeOwedMinor: Math.max(0, sale.feeOwedMinor - perTicketFee * reversed),
      ...(refundedCount >= sale.quantity
        ? { status: 'refunded', refundedAt: new Date().toISOString() }
        : {}),
    });
  }
  return { ok: true, reversed };
}

/** Refund every still-valid ticket of a door sale. */
export function refundDoorSale(saleId: string, organizerId: string) {
  return reverseDoorTickets(saleId, organizerId);
}

/** Refund one ticket of a multi-ticket door sale, leaving the rest valid. */
export function refundDoorTicket(saleId: string, ticketId: string, organizerId: string) {
  return reverseDoorTickets(saleId, organizerId, ticketId);
}
