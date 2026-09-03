import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import {
  getConnectedAccountStatus,
  isConnectConfigured,
  transferToConnected,
} from '@/backend/payments/stripe-connect';
import { whiteLabelProfileFor } from '@/backend/services/white-label';
import type { Payout, UserProfile } from '@/shared/types';

/**
 * Settlement — paying the owed money out, idempotently.
 *
 * The platform already records what every party is owed: a promoter's commission on
 * `partner_links`, a box-office service fee on `box_office_sales`, an organiser's face
 * value in their tickets. Recording it was always the easy half. This is the other half —
 * actually moving it — done the one way money must always move here: **idempotently**.
 *
 * Every payout is keyed. The key IS the `payouts/{key}` document id, so a repeated
 * settlement (a retry, a double click, a re-run of a scheduler) finds the record already
 * there and pays nothing again. That is the same guard issuance uses on the way in, and it
 * is the only thing standing between "the scheduler ran twice" and "the promoter was paid
 * twice".
 *
 * When Connect is off, or a party has not finished onboarding, a payout is not an error and
 * not a silent no-op: it is **recorded as `blocked`**, so the money stays owed, visibly, and
 * settles the moment the account is ready. Nothing here ever reports success it did not have.
 */

const PAYOUTS = 'payouts';

/**
 * A stable idempotency key for one payout. Pure, so the caller and a retry derive the same
 * string. `periodKey` scopes it — an event id, a sale id, a month — so the *same* debt is
 * paid once while a *new* period is a new, payable key.
 */
export function payoutKey(party: string, partyId: string, reason: string, periodKey: string): string {
  return `${party}_${partyId}_${reason}_${periodKey}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 300);
}

/**
 * What a white-label organiser is owed for one event, summed from the recorded payment
 * events. Pure, so it is unit-tested without the database.
 *
 * White-label changes the organiser's payout from face value to `organiserPayoutMinor` —
 * what `computeWhiteLabelOrder` worked out at checkout (buyer total − the platform's flat
 * cut − the card cost the organiser bears). That figure was recorded on the payment
 * event's `feeSnapshot` and is read back here, never recomputed: §16 forbids re-pricing a
 * historical order from whatever the config says later, which is the whole reason the
 * snapshot exists.
 *
 * The rules encoded here:
 * - Only **issued** payments count; a `refund` event marks its order (by the shared
 *   payment-intent ref) and that order's payout is netted out — the same "a refunded sale
 *   is not owed" the face path gets by skipping refunded tickets.
 * - Only card and mobile-money rails; **offline/box-office** sales are cash the organiser
 *   already holds, and **free** claims owe nothing — both excluded, exactly as the face
 *   path excludes `paymentProvider === 'offline'` and zero-price tickets.
 * - `organiserPayoutMinor` is the amount; on a pre-payout-field snapshot it falls back to
 *   `faceMinor` (a standard order keeps face), and a snapshot-less event is skipped rather
 *   than guessed.
 */
export interface PayableEvent {
  intent?: string;
  provider?: string;
  providerRef?: string;
  refundsRef?: string;
  feeSnapshot?: { organiserPayoutMinor?: number; faceMinor?: number; buyerTotalMinor?: number };
}

export function sumWhiteLabelPayable(events: PayableEvent[]): number {
  const refundedRefs = new Set<string>();
  for (const e of events) {
    if (e.intent === 'refund' && e.refundsRef) refundedRefs.add(e.refundsRef);
  }

  let owed = 0;
  for (const e of events) {
    if (e.intent !== 'issue') continue;
    // Card and mobile money only — box-office ('offline') is cash already taken, free owes nothing.
    if (e.provider !== 'stripe' && e.provider !== 'bitripay') continue;
    if (e.providerRef && refundedRefs.has(e.providerRef)) continue; // the order was refunded
    const snap = e.feeSnapshot;
    if (!snap) continue; // no quote recorded → not counted, never assumed zero-or-face blindly
    const payout =
      typeof snap.organiserPayoutMinor === 'number' ? snap.organiserPayoutMinor : snap.faceMinor ?? 0;
    if (payout > 0) owed += Math.round(payout);
  }
  return owed;
}

export interface SettleInput {
  key: string;
  party: 'organiser' | 'promoter';
  partyId: string;
  connectedAccountId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  metadata?: Record<string, string>;
}

export type SettleResult =
  | { ok: true; status: 'paid'; transferId: string }
  | { ok: true; status: 'already-settled' }
  | { ok: false; status: 'blocked' | 'failed'; error: string };

/**
 * Settle one debt to one party. Records the intent FIRST (claiming the idempotency key),
 * then moves the money, then records the outcome — so a crash after the transfer cannot
 * lose the fact that it happened, and a retry sees the claimed key and refuses to double-pay.
 */
export async function settle(input: SettleInput): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, status: 'failed', error: 'Settlement is unavailable.' };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, status: 'failed', error: 'A payout must be a positive whole amount.' };
  }

  const db = getAdminDb();
  const ref = db.collection(PAYOUTS).doc(input.key);

  // Claim the key. A create that fails with ALREADY_EXISTS (code 6) means this debt was
  // already settled (or is being settled) — the whole point of the guard.
  const base: Omit<Payout, 'status' | 'transferId' | 'error'> = {
    id: input.key,
    party: input.party,
    partyId: input.partyId,
    connectedAccountId: input.connectedAccountId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
  try {
    await ref.create({ ...base, status: 'blocked' });
  } catch (error) {
    if ((error as { code?: number }).code !== 6) {
      reportError(error, { scope: 'settlement.claim', key: input.key });
      return { ok: false, status: 'failed', error: 'Could not start the payout.' };
    }
    // The key already exists. Only a **paid** debt is done; a `blocked` or `failed` one is
    // retryable — this is exactly the case that matters for "settles the moment the account
    // is ready", where the first attempt claimed the key while Connect was off or the
    // organiser had not finished onboarding. Retrying is safe: the transfer below carries
    // this same key as its Stripe idempotency key, so a re-attempt can never move the money
    // twice even under a concurrent run. Falling through re-runs the Connect checks + transfer.
    const existing = (await ref.get()).data() as Payout | undefined;
    if (existing?.status === 'paid') {
      return { ok: true, status: 'already-settled' };
    }
  }

  // Connect off, or nothing to pay to: leave it recorded as blocked. The debt stays owed
  // and visible; re-running once Connect is live settles it under a fresh key by the caller.
  if (!isConnectConfigured()) {
    return { ok: false, status: 'blocked', error: 'Payouts are not enabled yet.' };
  }

  const status = await getConnectedAccountStatus(input.connectedAccountId);
  if (!status.ok || !status.status.payoutsEnabled) {
    await ref.update({ error: status.ok ? 'Account cannot receive payouts yet.' : status.error });
    return { ok: false, status: 'blocked', error: 'That account cannot receive payouts yet.' };
  }

  const transfer = await transferToConnected({
    accountId: input.connectedAccountId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    idempotencyKey: input.key,
    metadata: { party: input.party, partyId: input.partyId, reason: input.reason, ...input.metadata },
  });

  if (!transfer.ok) {
    await ref.update({ status: 'failed', error: transfer.error });
    return { ok: false, status: 'failed', error: transfer.error };
  }

  await ref.update({ status: 'paid', transferId: transfer.transferId });
  return { ok: true, status: 'paid', transferId: transfer.transferId };
}

/**
 * Settle a debt to an organiser, resolving their connected account from their profile. A
 * thin wrapper so callers name the organiser, not their Stripe id.
 */
export async function settleOrganiser(input: {
  organiserId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  periodKey: string;
  metadata?: Record<string, string>;
}): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, status: 'failed', error: 'Settlement is unavailable.' };

  const snap = await getAdminDb().collection('users').doc(input.organiserId).get();
  const profile = snap.data() as Pick<UserProfile, 'stripeConnectId'> | undefined;
  if (!profile?.stripeConnectId) {
    return { ok: false, status: 'blocked', error: 'This organiser has not connected a payout account.' };
  }

  return settle({
    key: payoutKey('organiser', input.organiserId, input.reason, input.periodKey),
    party: 'organiser',
    partyId: input.organiserId,
    connectedAccountId: profile.stripeConnectId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    metadata: input.metadata,
  });
}

/**
 * Settle one event's takings to its organiser — the per-event trigger.
 *
 * On the standard model the organiser is owed the **face value of every online ticket** (at
 * 0% commission they keep 100% of face; the platform's revenue is the buyer-side service fee
 * it already holds). Box-office tickets are excluded — that face is cash the organiser already
 * took at the door — exactly as the revenue page computes it.
 *
 * On **white-label** the organiser's payout is not face: it is the `organiserPayoutMinor`
 * each order recorded (buyer total − the platform's flat per-ticket cut − the card cost the
 * organiser bears). So a white-label organiser settles from the recorded fee snapshots via
 * `sumWhiteLabelPayable`, never from face — paying face would over-pay them by the platform's
 * cut. Both models key on the event, so settling the same event twice pays once; a fresh
 * event is a fresh, payable key.
 *
 * Deliberately settles only events that have **finished**: a refund before the event is
 * common and would otherwise mean clawing money back from a bank, which Connect does not do
 * cheaply. After the event, refunds are rare, and this is the honest first cut — a refund
 * after payout is a known, documented edge, not a silent overpayment.
 */
export async function settleOrganiserEvent(
  organiserId: string,
  eventId: string
): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, status: 'failed', error: 'Settlement is unavailable.' };
  const db = getAdminDb();

  const eventSnap = await db.collection('events').doc(eventId).get();
  const event = eventSnap.data() as { organizerId?: string; currency?: string; date?: string } | undefined;
  if (!event || event.organizerId !== organiserId) {
    return { ok: false, status: 'failed', error: 'Not your event.' };
  }
  if (event.date && new Date(event.date).getTime() > Date.now()) {
    return { ok: false, status: 'blocked', error: 'This event has not finished yet.' };
  }

  // What the organiser is owed. White-label changes this from face value to the recorded
  // white-label payout, so the branch is on the organiser, not the event.
  const wl = await whiteLabelProfileFor(organiserId).catch(() => null);

  let payableMinor: number;
  if (wl) {
    // White-label: sum the payout recorded on each order's fee snapshot — never face, and
    // never recomputed from the current config (§16). Read from payment_events, which is
    // where the quote was persisted; refunded orders net out inside sumWhiteLabelPayable.
    const events = await db.collection('payment_events').where('eventId', '==', eventId).get();
    payableMinor = sumWhiteLabelPayable(events.docs.map((d) => d.data() as PayableEvent));
  } else {
    // Standard: face of online tickets only — single-field query, filtered in memory.
    const tickets = await db.collection('tickets').where('eventId', '==', eventId).get();
    payableMinor = 0;
    for (const doc of tickets.docs) {
      const t = doc.data() as { status?: string; paymentProvider?: string; price?: number };
      if (t.status === 'refunded') continue;
      if (t.paymentProvider === 'offline') continue; // box-office cash the organiser already holds
      payableMinor += Math.round((Number(t.price) || 0) * 100);
    }
  }

  if (payableMinor <= 0) {
    return { ok: false, status: 'blocked', error: 'Nothing to settle for this event yet.' };
  }

  return settleOrganiser({
    organiserId,
    amountMinor: payableMinor,
    currency: event.currency || 'GBP',
    reason: 'organiser_event',
    periodKey: eventId,
    // `wl` marks the payout as the white-label amount for the audit trail — face and
    // white-label payouts settle under the same per-event key, so a re-run still pays once.
    metadata: { eventId, ...(wl ? { wl: '1' } : {}) },
  });
}

export interface SweepResult {
  scanned: number;
  paid: number;
  blocked: number;
  failed: number;
  skipped: number;
  /** True when Connect is not enabled — the sweep did nothing, on purpose. */
  connectOff?: boolean;
}

/**
 * Settle every finished event that is not already paid — the automatic per-event payout.
 *
 * The manual "Withdraw" button settles one organiser's events on demand; this is the sweep
 * that makes the payout fire on its own, so an organiser is paid after each event without
 * anyone pressing anything (the one evening nobody presses it is the evening they go unpaid).
 * A scheduler calls it; it is idempotent by the same per-event key, so running it every hour
 * pays each event exactly once.
 *
 * Cheap before it is thorough: an event whose payout is already `paid` is skipped on a single
 * document read, before the heavier summation runs. Everything else — refunds, the white-label
 * payout, the blocked-until-onboarded state — is `settleOrganiserEvent`'s job, unchanged.
 *
 * Does nothing while Connect is off, rather than claiming payout keys it cannot honour.
 */
export async function settleFinishedEvents(limit = 300): Promise<SweepResult> {
  const zero: SweepResult = { scanned: 0, paid: 0, blocked: 0, failed: 0, skipped: 0 };
  if (!isAdminConfigured()) return zero;
  if (!isConnectConfigured()) return { ...zero, connectOff: true };

  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  // Finished events only — a single-field range on the ISO date string (no composite index).
  // Event dates are ISO strings throughout, so a string range is chronologically correct.
  const snap = await db.collection('events').where('date', '<=', nowIso).limit(limit).get();

  const out: SweepResult = { ...zero };
  for (const doc of snap.docs) {
    out.scanned += 1;
    const organiserId = doc.data()?.organizerId as string | undefined;
    if (!organiserId) {
      out.skipped += 1;
      continue;
    }
    // One cheap read to skip an event already paid, before the summation query.
    const key = payoutKey('organiser', organiserId, 'organiser_event', doc.id);
    const paidAlready = await db.collection(PAYOUTS).doc(key).get();
    if (paidAlready.exists && (paidAlready.data() as Payout).status === 'paid') {
      out.skipped += 1;
      continue;
    }

    const result = await settleOrganiserEvent(organiserId, doc.id);
    if (result.ok && result.status === 'paid') out.paid += 1;
    else if (result.ok) out.skipped += 1; // already-settled
    else if (result.status === 'blocked') out.blocked += 1;
    else out.failed += 1;
  }
  return out;
}

/**
 * A white-label organiser's true balance for the dashboard — payout, not face.
 *
 * The revenue page computes a standard organiser's balance client-side from ticket face
 * value, which is correct there (they keep 100% of face). A white-label organiser keeps
 * their recorded payout instead, which the client cannot compute (it depends on the
 * per-order card cost). So this returns the authoritative figures, summed across all their
 * events' recorded snapshots the same way settlement pays them, and the page shows these
 * instead of the face guess.
 *
 * Pooled into one settlement currency exactly as the page already pools ticket amounts.
 */
export interface WhiteLabelOwed {
  /** What the organiser will actually be paid, across all their online orders (minor units). */
  payableMinor: number;
  /** What fans paid in total — buyer totals — for the "fans paid" figure (minor units). */
  grossMinor: number;
  currency: string;
  /** Per-order lines for the statement, newest first. */
  orders: Array<{ id: string; date: string; description: string; payoutMinor: number; currency: string }>;
}

export async function whiteLabelOwedForOrganiser(organiserId: string): Promise<WhiteLabelOwed> {
  const empty: WhiteLabelOwed = { payableMinor: 0, grossMinor: 0, currency: 'GBP', orders: [] };
  if (!isAdminConfigured() || !organiserId) return empty;
  const db = getAdminDb();

  // The organiser's events — single-field query, and the title/currency for each line.
  const eventsSnap = await db.collection('events').where('organizerId', '==', organiserId).get();
  if (eventsSnap.empty) return empty;
  const titleOf = new Map<string, { title: string; currency: string }>();
  for (const doc of eventsSnap.docs) {
    const e = doc.data() as { title?: string; currency?: string };
    titleOf.set(doc.id, { title: e.title ?? 'Event', currency: e.currency ?? 'GBP' });
  }

  // Their payment events, gathered in id batches of 10 (Firestore `in` limit).
  const eventIds = [...titleOf.keys()];
  const all: PayableEvent[] = [];
  const rich: Array<PayableEvent & { providerEventId?: string; eventId?: string; receivedAt?: string }> = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    const batch = eventIds.slice(i, i + 10);
    const snap = await db.collection('payment_events').where('eventId', 'in', batch).get();
    for (const doc of snap.docs) {
      const data = doc.data() as PayableEvent & { eventId?: string; receivedAt?: string };
      all.push(data);
      rich.push({ ...data, providerEventId: doc.id });
    }
  }

  const payableMinor = sumWhiteLabelPayable(all);

  // Gross (buyer totals) and per-order lines, over the same non-refunded card/momo issues.
  const refundedRefs = new Set<string>();
  for (const e of all) if (e.intent === 'refund' && e.refundsRef) refundedRefs.add(e.refundsRef);

  let grossMinor = 0;
  const orders: WhiteLabelOwed['orders'] = [];
  for (const e of rich) {
    if (e.intent !== 'issue') continue;
    if (e.provider !== 'stripe' && e.provider !== 'bitripay') continue;
    if (e.providerRef && refundedRefs.has(e.providerRef)) continue;
    const snap = e.feeSnapshot;
    if (!snap) continue;
    const payout =
      typeof snap.organiserPayoutMinor === 'number' ? snap.organiserPayoutMinor : snap.faceMinor ?? 0;
    grossMinor += Math.round(snap.buyerTotalMinor ?? 0);
    const meta = e.eventId ? titleOf.get(e.eventId) : undefined;
    orders.push({
      id: e.providerEventId ?? `${e.eventId}-${orders.length}`,
      date: e.receivedAt ?? '',
      description: meta?.title ?? 'Event',
      payoutMinor: Math.round(payout),
      currency: meta?.currency ?? 'GBP',
    });
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));

  return { payableMinor, grossMinor, currency: 'GBP', orders };
}

/** A party's payout history, newest first. */
export async function listPayouts(partyId: string): Promise<Payout[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb().collection(PAYOUTS).where('partyId', '==', partyId).limit(200).get();
    return snap.docs
      .map((d) => d.data() as Payout)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    reportError(error, { scope: 'settlement.list', partyId });
    return [];
  }
}
