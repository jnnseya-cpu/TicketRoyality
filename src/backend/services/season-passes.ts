import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { availableInTier } from '@/shared/pricing';
import type { SeasonPass, TicketTier } from '@/shared/types';

/**
 * Season passes: one purchase, a ticket for every covered event.
 *
 * ## Issuance is the existing issuance, N times
 *
 * A settled pass writes one `payment_events` document per covered event, each with its
 * own idempotency key derived from the payment. The function that has always issued
 * tickets does the rest — same transaction, same oversell guard, same emails. There is
 * no second issuance path, which is the rule this codebase has kept through every
 * feature: hospitality, seats, and now this.
 *
 * A consequence worth stating: a pass consumes **real inventory** in each event, in the
 * tier the organiser chose. Twenty pass holders are twenty seats gone from each fixture,
 * counted the same way single tickets are, so a fixture cannot be quietly oversold by
 * people nobody added up.
 *
 * ## Availability is checked before the card, not after
 *
 * If one fixture in the run is sold out, the pass cannot be honoured — and finding that
 * out after taking the money means a refund and an apology. `passAvailability` is what
 * checkout calls first.
 */

const PASSES = 'season_passes';
const PURCHASES = 'season_pass_purchases';

export async function createPass(input: Omit<SeasonPass, 'id' | 'createdAt' | 'sold'>): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  if (!isAdminConfigured()) return { ok: false, error: 'Season passes are unavailable.' };

  if (input.eventIds.length === 0) return { ok: false, error: 'A pass has to cover something.' };
  // Every covered event needs a tier chosen, or issuance has nothing to consume and the
  // holder arrives at that fixture with no ticket.
  const missing = input.eventIds.filter((id) => !input.tierIds[id]);
  if (missing.length > 0) {
    return { ok: false, error: 'Choose which ticket type the pass takes in every event.' };
  }

  try {
    const ref = await getAdminDb()
      .collection(PASSES)
      .add({ ...input, sold: 0, createdAt: new Date().toISOString() });
    return { ok: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'passes.create', organizerId: input.organizerId });
    return { ok: false, error: 'Could not create that pass.' };
  }
}

export async function getPass(passId: string): Promise<SeasonPass | null> {
  if (!isAdminConfigured()) return null;
  try {
    const snap = await getAdminDb().collection(PASSES).doc(passId).get();
    return snap.exists ? ({ id: snap.id, ...(snap.data() as object) } as SeasonPass) : null;
  } catch (error) {
    reportError(error, { scope: 'passes.get', passId });
    return null;
  }
}

export async function listPasses(organizerId: string): Promise<SeasonPass[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(PASSES)
      .where('organizerId', '==', organizerId)
      .limit(100)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as SeasonPass);
  } catch (error) {
    reportError(error, { scope: 'passes.list', organizerId });
    return [];
  }
}

export type PassAvailability =
  | { ok: true; passesLeft: number }
  | { ok: false; reason: 'inactive' | 'sold-out' | 'fixture-full' | 'unavailable'; error: string };

/**
 * Can this pass still be honoured in full?
 *
 * Every covered fixture is checked, because a pass that covers ten nights and can only
 * seat somebody at nine is not a pass — it is a complaint with a receipt attached.
 */
export async function passAvailability(passId: string): Promise<PassAvailability> {
  const pass = await getPass(passId);
  if (!pass) return { ok: false, reason: 'unavailable', error: 'That pass no longer exists.' };
  if (!pass.active) return { ok: false, reason: 'inactive', error: 'That pass is not on sale.' };

  const passesLeft = pass.quantity - (pass.sold ?? 0);
  if (passesLeft <= 0) return { ok: false, reason: 'sold-out', error: 'Season passes have sold out.' };

  try {
    const db = getAdminDb();
    for (const eventId of pass.eventIds) {
      const snap = await db.collection('events').doc(eventId).get();
      const tier = (snap.data()?.ticketTiers as TicketTier[] | undefined)?.find(
        (t) => t.id === pass.tierIds[eventId]
      );
      if (!tier || availableInTier(tier) <= 0) {
        return {
          ok: false,
          reason: 'fixture-full',
          error: `${snap.data()?.title ?? 'One of the fixtures'} is full, so the pass cannot be honoured.`,
        };
      }
    }
    return { ok: true, passesLeft };
  } catch (error) {
    reportError(error, { scope: 'passes.availability', passId });
    return { ok: false, reason: 'unavailable', error: 'Could not check the fixtures.' };
  }
}

export type SettleResult =
  | { ok: true; issued: number }
  | { ok: false; reason: 'no-pass' | 'duplicate' | 'unavailable' };

/**
 * A paid pass becomes a ticket in every covered event.
 *
 * Each `payment_events` id is derived from the payment **and** the event, so one pass
 * purchase produces N independent, individually idempotent issuances. A redelivered
 * webhook re-derives the same ids and creates nothing.
 */
export async function settlePassPurchase(input: {
  providerEventId: string;
  passId: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  providerRef?: string;
}): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' };

  const db = getAdminDb();
  const pass = await getPass(input.passId);
  if (!pass) return { ok: false, reason: 'no-pass' };

  const purchaseRef = db.collection(PURCHASES).doc(input.providerEventId);

  try {
    // The purchase record is the idempotency gate for the *pass* itself — the counter
    // must not move twice on a redelivery even though each issuance is separately safe.
    await purchaseRef.create({
      passId: input.passId,
      organizerId: pass.organizerId,
      userId: input.userId,
      email: input.attendeeEmail,
      eventIds: pass.eventIds,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6) return { ok: false, reason: 'duplicate' };
    reportError(error, { scope: 'passes.settle', passId: input.passId });
    return { ok: false, reason: 'unavailable' };
  }

  // The price is spread evenly across the fixtures so a refund of one night reverses a
  // sensible share, rather than one ticket carrying the whole pass and the rest zero.
  const perEvent = pass.eventIds.length > 0 ? pass.price / pass.eventIds.length : 0;

  let issued = 0;
  for (const eventId of pass.eventIds) {
    const outcome = await recordPaymentEvent({
      providerEventId: `${input.providerEventId}__${eventId}`,
      provider: 'stripe',
      providerType: 'season_pass',
      intent: 'issue',
      eventId,
      tierId: pass.tierIds[eventId],
      userId: input.userId,
      quantity: 1,
      price: Math.round(perEvent * 100) / 100,
      currency: pass.currency,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      providerRef: input.providerRef,
    });
    if (outcome === 'recorded') issued += 1;
  }

  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.collection(PASSES).doc(input.passId).update({ sold: FieldValue.increment(1) });
  } catch (error) {
    reportError(error, { scope: 'passes.count', passId: input.passId });
  }

  return { ok: true, issued };
}

/** Whether this person holds a pass covering this event — used to explain their ticket. */
export async function passesForUser(userId: string): Promise<
  Array<{ passId: string; organizerId: string; eventIds: string[] }>
> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(PURCHASES)
      .where('userId', '==', userId)
      .limit(50)
      .get();
    return snap.docs.map((d) => d.data() as { passId: string; organizerId: string; eventIds: string[] });
  } catch (error) {
    reportError(error, { scope: 'passes.forUser', userId });
    return [];
  }
}
