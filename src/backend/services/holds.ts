import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { TicketTier } from '@/shared/types';

/**
 * Checkout inventory holds.
 *
 * Without these, two buyers can both reach the payment page for the last ticket. Both
 * pay. Issuance stops the oversell — that part was always sound and is covered by tests
 * — but the loser has been charged, gets no ticket, and needs a manual refund. It is not
 * data loss; it is a customer who paid and is now owed money by a human who has to
 * notice.
 *
 * A hold reserves the seat for the length of a checkout so the second buyer is told the
 * tier is gone **before** they enter card details, which is the only point where saying
 * no is cheap.
 *
 * ## Why `held` and not "reduce `quantity`"
 *
 * `quantity` is the organiser's statement of how many exist. Mutating it to reserve a
 * seat destroys that number, and every report built on it. `held` is a separate counter
 * that `availableInTier()` already subtracts, so a hold is invisible to accounting and
 * obvious to the seat map.
 *
 * ## Expiry is a floor, not a promise
 *
 * A hold has a deadline and the sweep runs every minute, so a seat can sit held for up
 * to a minute past expiry. That is deliberate: the alternative is releasing on read,
 * which turns every catalogue page view into a write.
 */

/** Long enough for a card, 3-D Secure and a fumbled CVV. Short enough not to strand a seat. */
export const HOLD_WINDOW_MS = 15 * 60 * 1000;

export interface Hold {
  eventId: string;
  tierId: string;
  quantity: number;
  expiresAt: string;
  releasedAt?: string;
  /** `consumed` when issuance used it, `expired` when the sweep took it back. */
  outcome?: 'consumed' | 'expired' | 'abandoned';
}

export type PlaceHoldResult =
  | { ok: true; holdId: string }
  | { ok: false; reason: 'sold-out' | 'no-tier' | 'no-event' | 'unavailable'; error: string };

/**
 * Reserve inventory, or refuse.
 *
 * The read and the write are in one transaction: two simultaneous checkouts for the last
 * seat cannot both succeed, which is the entire point. Placing a hold outside a
 * transaction would reproduce the bug it exists to fix, one layer earlier.
 */
export async function placeHold(
  eventId: string,
  tierId: string,
  quantity: number
): Promise<PlaceHoldResult> {
  if (!isAdminConfigured()) {
    return { ok: false, reason: 'unavailable', error: 'Checkout is unavailable.' };
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const holdRef = db.collection('checkout_holds').doc();

  try {
    return await db.runTransaction<PlaceHoldResult>(async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists) return { ok: false, reason: 'no-event', error: 'That event no longer exists.' };

      const tiers = (snap.data()?.ticketTiers ?? []) as TicketTier[];
      const index = tiers.findIndex((t) => t.id === tierId);
      if (index < 0) {
        return { ok: false, reason: 'no-tier', error: 'That ticket type is no longer on sale.' };
      }

      const tier = tiers[index];
      const held = tier.held ?? 0;
      const available = tier.quantity - (tier.sold ?? 0) - held;

      if (available < quantity) {
        return {
          ok: false,
          reason: 'sold-out',
          error:
            available <= 0
              ? 'That ticket type just sold out.'
              : `Only ${available} left — someone is checking out with the rest.`,
        };
      }

      const next = [...tiers];
      next[index] = { ...tier, held: held + quantity };
      tx.update(eventRef, { ticketTiers: next });

      tx.set(holdRef, {
        eventId,
        tierId,
        quantity,
        expiresAt: new Date(Date.now() + HOLD_WINDOW_MS).toISOString(),
      } satisfies Hold);

      return { ok: true, holdId: holdRef.id };
    });
  } catch (error) {
    reportError(error, { scope: 'holds.place', eventId, tierId, quantity });
    return { ok: false, reason: 'unavailable', error: 'Could not reserve those tickets.' };
  }
}

/**
 * Give the inventory back.
 *
 * Idempotent by the `releasedAt` stamp: a hold released twice — by the sweep and by a
 * cancelled checkout arriving at the same moment — must not credit the tier twice, which
 * would let the tier oversell in the opposite direction.
 */
export async function releaseHold(
  holdId: string,
  outcome: Hold['outcome'] = 'abandoned'
): Promise<boolean> {
  if (!isAdminConfigured() || !holdId) return false;

  const db = getAdminDb();
  const holdRef = db.collection('checkout_holds').doc(holdId);

  try {
    return await db.runTransaction<boolean>(async (tx) => {
      const hold = await tx.get(holdRef);
      if (!hold.exists) return false;

      const data = hold.data() as Hold;
      if (data.releasedAt) return false;

      const eventRef = db.collection('events').doc(data.eventId);
      const snap = await tx.get(eventRef);

      if (snap.exists) {
        const tiers = (snap.data()?.ticketTiers ?? []) as TicketTier[];
        const index = tiers.findIndex((t) => t.id === data.tierId);
        if (index >= 0) {
          const tier = tiers[index];
          const next = [...tiers];
          // Floored at zero. A negative `held` would silently inflate availability, and
          // an inconsistency here should cost a seat, never invent one.
          next[index] = { ...tier, held: Math.max(0, (tier.held ?? 0) - data.quantity) };
          tx.update(eventRef, { ticketTiers: next });
        }
      }

      tx.update(holdRef, { releasedAt: new Date().toISOString(), outcome });
      return true;
    });
  } catch (error) {
    reportError(error, { scope: 'holds.release', holdId });
    return false;
  }
}

/** The sweep. Returns how many were actually given back. */
export async function expireHolds(now = new Date(), limit = 200): Promise<number> {
  if (!isAdminConfigured()) return 0;

  try {
    const stale = await getAdminDb()
      .collection('checkout_holds')
      .where('expiresAt', '<', now.toISOString())
      .limit(limit)
      .get();

    let released = 0;
    for (const doc of stale.docs) {
      if ((doc.data() as Hold).releasedAt) continue;
      if (await releaseHold(doc.id, 'expired')) released += 1;
    }
    return released;
  } catch (error) {
    reportError(error, { scope: 'holds.expire' });
    return 0;
  }
}
