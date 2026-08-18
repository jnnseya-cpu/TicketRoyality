import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { seatBelongsToTier } from '@/shared/seating';
import type { SeatingSection, TicketTier } from '@/shared/types';

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
  /** Specific seats reserved by this hold, for a seated event. */
  seats?: string[];
  /** Set once the seat locks have been cleaned up. See `clearConsumedSeatLocks`. */
  seatsCleared?: boolean;
}

/**
 * One document per seat, created inside the hold transaction.
 *
 * `tx.create` fails if the document exists, so two people choosing row F seat 12 at the
 * same instant cannot both hold it — the database refuses the second, rather than a
 * read-then-write deciding it after the fact. It is the same discipline as
 * `payment_events`: uniqueness enforced by the document id.
 */
export const SEAT_LOCKS = 'seat_locks';

export function seatLockId(eventId: string, seat: string): string {
  return `${eventId}__${seat.trim().toUpperCase()}`;
}

export type PlaceHoldResult =
  | { ok: true; holdId: string }
  | {
      ok: false;
      reason: 'sold-out' | 'no-tier' | 'no-event' | 'seat-taken' | 'unavailable';
      error: string;
    };

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
  quantity: number,
  /**
   * How long the reservation lasts. Defaults to a checkout window.
   *
   * Hospitality passes a longer one: a table booked on a deposit is reserved until the
   * balance is due, which may be weeks. Reusing the same counter and the same sweep for
   * both means hospitality inventory cannot drift away from ticket inventory — they are
   * literally the same number — while still letting a lapsed booking return the table to
   * sale on its own.
   */
  ttlMs: number = HOLD_WINDOW_MS,
  /**
   * Specific seats, for a seated event. Reserved in the same transaction as the tier
   * count, so a seat and the inventory behind it can never disagree.
   */
  seats: string[] = []
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

      /*
       * The seat has to be one this tier actually sells.
       *
       * The label arrives from a browser. Without this a £20 buyer posts "A1" and sits in
       * the £200 section — and because the tier count is still right, nothing looks wrong
       * anywhere until somebody holding a front-row ticket finds it occupied. Checked
       * against the event document inside the transaction, so it is the same read the
       * seats are locked against.
       */
      const sections = (snap.data()?.seating ?? []) as SeatingSection[];
      if (seats.length > 0 && sections.length > 0) {
        const wrong = seats.filter((seat) => !seatBelongsToTier(sections, tierId, seat));
        if (wrong.length > 0) {
          return {
            ok: false,
            reason: 'seat-taken',
            error: `${wrong.join(', ')} ${wrong.length === 1 ? 'is not' : 'are not'} on sale with this ticket. Choose again.`,
          };
        }
      }

      /*
       * The seats, locked by document id.
       *
       * `create` rather than `set`: it fails if the lock exists, which is how the second
       * buyer for one seat is refused by the database rather than by a check that read a
       * moment too early. Inside the same transaction as the tier count, so a held seat
       * always has held inventory behind it.
       */
      for (const seat of seats) {
        tx.create(db.collection(SEAT_LOCKS).doc(seatLockId(eventId, seat)), {
          eventId,
          seat: seat.trim().toUpperCase(),
          holdId: holdRef.id,
          createdAt: new Date().toISOString(),
        });
      }

      const next = [...tiers];
      next[index] = { ...tier, held: held + quantity };
      tx.update(eventRef, { ticketTiers: next });

      tx.set(holdRef, {
        eventId,
        tierId,
        quantity,
        expiresAt: new Date(Date.now() + Math.max(60_000, ttlMs)).toISOString(),
        ...(seats.length > 0 ? { seats: seats.map((s) => s.trim().toUpperCase()) } : {}),
      } satisfies Hold);

      return { ok: true, holdId: holdRef.id };
    });
  } catch (error) {
    // ALREADY_EXISTS from a seat lock. Somebody else took the seat between the buyer
    // opening the map and pressing pay, which is a normal thing to happen and needs a
    // sentence a human understands rather than an outage.
    if ((error as { code?: number }).code === 6) {
      return {
        ok: false,
        reason: 'seat-taken',
        error: 'One of those seats was just taken. Choose again.',
      };
    }
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

      /* The seat locks go back with the inventory. A seat still locked by an abandoned
         checkout is a seat nobody can buy and nobody is sitting in. */
      for (const seat of data.seats ?? []) {
        tx.delete(db.collection(SEAT_LOCKS).doc(seatLockId(data.eventId, seat)));
      }

      tx.update(holdRef, {
        releasedAt: new Date().toISOString(),
        outcome,
        ...((data.seats ?? []).length > 0 ? { seatsCleared: true } : {}),
      });
      return true;
    });
  } catch (error) {
    reportError(error, { scope: 'holds.release', holdId });
    return false;
  }
}

/**
 * Clear seat locks left behind by a hold that issuance consumed.
 *
 * Issuance runs in `functions/`, a separate deployable that cannot import this module, so
 * it marks the hold consumed and knows nothing about seat locks. Once the tickets exist
 * the lock is redundant — the seat is taken because a ticket says so — and leaving it
 * would mean a **refunded** seat could never be resold, since nothing would ever delete
 * the lock.
 *
 * Availability is therefore computed from tickets plus live locks, and this removes the
 * locks that have done their job.
 */
export async function clearConsumedSeatLocks(limit = 200): Promise<number> {
  if (!isAdminConfigured()) return 0;

  const db = getAdminDb();
  try {
    const consumed = await db
      .collection('checkout_holds')
      .where('outcome', '==', 'consumed')
      .limit(limit)
      .get();

    let cleared = 0;
    for (const doc of consumed.docs) {
      const hold = doc.data() as Hold;
      if (hold.seatsCleared || !hold.seats?.length) continue;

      await Promise.all(
        hold.seats.map((seat) =>
          db.collection(SEAT_LOCKS).doc(seatLockId(hold.eventId, seat)).delete()
        )
      );
      await doc.ref.update({ seatsCleared: true });
      cleared += hold.seats.length;
    }
    return cleared;
  } catch (error) {
    reportError(error, { scope: 'holds.clearSeatLocks' });
    return 0;
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
