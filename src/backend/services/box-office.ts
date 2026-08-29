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
 * Refund a door sale: reverse the tickets (through the same issuance path — provider
 * 'offline' means no external money moves), zero the owed fee, and mark the row. The cash
 * itself is handed back by the organiser; the system only squares the record and inventory.
 */
export async function refundDoorSale(
  saleId: string,
  organizerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'Unavailable right now.' };
  const db = getAdminDb();
  const ref = db.collection(SALES).doc(saleId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'Sale not found.' };
  const sale = snap.data() as BoxOfficeSale;
  if (sale.organizerId !== organizerId) return { ok: false, error: 'Not your sale.' };
  if (sale.status === 'refunded') return { ok: true }; // idempotent

  const refund = await recordPaymentEvent({
    providerEventId: `${saleId}_refund`,
    provider: 'offline',
    providerType: `box_office.refund`,
    intent: 'refund',
    eventId: sale.eventId,
    tierId: sale.tierId,
    userId: '',
    quantity: sale.quantity,
    price: 0,
    currency: sale.currency,
    attendeeName: '',
    attendeeEmail: '',
    refundsRef: saleId,
  });
  if (refund === 'unavailable') return { ok: false, error: 'Refund could not be recorded.' };

  await ref.update({ status: 'refunded', feeOwedMinor: 0, refundedAt: new Date().toISOString() });
  return { ok: true };
}
