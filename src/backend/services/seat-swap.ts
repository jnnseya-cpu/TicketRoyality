import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { SEAT_LOCKS, seatLockId } from '@/backend/services/holds';
import { seatBelongsToTier } from '@/shared/seating';
import type { SeatingSection } from '@/shared/types';

/**
 * Moving after the sale.
 *
 * ## Why this cannot be an update
 *
 * "Set this ticket's seat to F12" is one write, and two people doing it at the same
 * moment both succeed — which is exactly the double sale the seat lock was built to
 * prevent, arriving through a different door. A move is therefore a transaction that
 * claims the destination the same way checkout does: by creating a lock document whose id
 * is the seat, so the database refuses the second claim rather than a check that read a
 * moment too early.
 *
 * The lock is then released inside the same transaction, because a ticket now carries the
 * seat and `takenSeats` derives availability from tickets. Creating and deleting the lock
 * in one transaction looks redundant and is not: `create` is the exclusion, and holding it
 * afterwards would make the seat permanently unsellable if the move were ever rolled back.
 *
 * ## Two operations, because they are different promises
 *
 * `moveSeat` takes a free seat. `exchangeSeats` swaps two people who have both agreed —
 * neither seat is free at any point, so the free-seat path cannot express it, and doing it
 * as two moves would leave one person seatless in between if the second half failed.
 *
 * ## What a move deliberately does not do
 *
 * It does not touch money. Moving from a £20 seat to a £200 seat is an upgrade, and an
 * upgrade is a payment — so a move is confined to seats **on the ticket's own tier**.
 * Anything else is a refund and a repurchase, which is honest, auditable, and already
 * built.
 */

export type SwapResult =
  | { ok: true; seat: string; previousSeat?: string }
  | {
      ok: false;
      reason: 'no-ticket' | 'not-yours' | 'not-live' | 'seat-taken' | 'wrong-tier' | 'unavailable';
      error: string;
    };

function refuse(reason: Exclude<SwapResult, { ok: true }>['reason'], error: string): SwapResult {
  return { ok: false, reason, error };
}

interface TicketShape {
  eventId: string;
  userId: string;
  tierId?: string;
  status: string;
  seat?: string;
}

/**
 * Move one ticket to a free seat.
 *
 * `actorId` is the person asking: the ticket holder, or the event's organiser doing it at
 * the box office. A redeemed ticket cannot move — the holder is already inside and sitting
 * somewhere, and rewriting the seat then only makes the record disagree with the room.
 */
export async function moveSeat(
  ticketId: string,
  toSeat: string,
  actorId: string
): Promise<SwapResult> {
  if (!isAdminConfigured()) return refuse('unavailable', 'Seat changes are unavailable.');

  const seat = toSeat.trim().toUpperCase();
  if (!seat) return refuse('seat-taken', 'Choose a seat.');

  const db = getAdminDb();
  const ticketRef = db.collection('tickets').doc(ticketId);

  try {
    return await db.runTransaction<SwapResult>(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) return refuse('no-ticket', 'That ticket no longer exists.');

      const ticket = snap.data() as TicketShape;
      const eventRef = db.collection('events').doc(ticket.eventId);
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) return refuse('no-ticket', 'That event no longer exists.');

      const event = eventSnap.data() ?? {};
      const isHolder = ticket.userId === actorId;
      const isOrganiser = event.organizerId === actorId;
      if (!isHolder && !isOrganiser) {
        return refuse('not-yours', 'That ticket is not yours to move.');
      }

      if (ticket.status !== 'valid') {
        return refuse(
          'not-live',
          ticket.status === 'redeemed'
            ? 'That ticket has already been used at the door.'
            : 'That ticket is no longer valid.'
        );
      }

      if (ticket.seat && ticket.seat.trim().toUpperCase() === seat) {
        // Asking for the seat you are already in is not an error worth a refusal page.
        return { ok: true, seat, previousSeat: seat };
      }

      const sections = (event.seating ?? []) as SeatingSection[];
      if (sections.length === 0) return refuse('wrong-tier', 'This event has no seat map.');

      if (!seatBelongsToTier(sections, ticket.tierId ?? '', seat)) {
        /*
         * Covers three refusals that are one refusal to the person asking: the seat does
         * not exist, it is held back for a wheelchair user or a restricted view, or it
         * belongs to a more expensive tier. Moving into a better tier without paying is
         * the one that matters, and it is why this check is here rather than in the UI.
         */
        return refuse('wrong-tier', `${seat} is not available on your ticket type.`);
      }

      /* Somebody else's live ticket already in that seat. */
      const occupied = await tx.get(
        db
          .collection('tickets')
          .where('eventId', '==', ticket.eventId)
          .where('seat', '==', seat)
          .where('status', 'in', ['valid', 'redeemed'])
          .limit(1)
      );
      if (!occupied.empty && occupied.docs[0].id !== ticketId) {
        return refuse('seat-taken', `${seat} is taken.`);
      }

      /*
       * A checkout holding that seat right now. Claiming it by `create` is what makes two
       * simultaneous moves — or a move racing a purchase — resolve to exactly one winner.
       */
      const lockRef = db.collection(SEAT_LOCKS).doc(seatLockId(ticket.eventId, seat));
      tx.create(lockRef, {
        eventId: ticket.eventId,
        seat,
        holdId: `move:${ticketId}`,
        createdAt: new Date().toISOString(),
      });
      // Released immediately: the ticket below is what makes the seat taken from now on.
      tx.delete(lockRef);

      tx.update(ticketRef, { seat, seatMovedAt: new Date().toISOString() });
      return { ok: true, seat, previousSeat: ticket.seat };
    });
  } catch (error) {
    // ALREADY_EXISTS: a checkout is holding that seat, or another move claimed it first.
    if ((error as { code?: number }).code === 6) {
      return refuse('seat-taken', `${seat} was just taken. Choose another.`);
    }
    reportError(error, { scope: 'seats.move', ticketId, seat });
    return refuse('unavailable', 'That seat change could not be made.');
  }
}

/**
 * Swap two ticket holders' seats.
 *
 * Neither seat is free at any moment, so this cannot be two moves — and as two moves, a
 * failure halfway leaves somebody with no seat at all. One transaction, both writes, or
 * neither.
 *
 * Only the organiser can do this: it changes where somebody *else* is sitting, and an
 * attendee moving a stranger without being asked is not a feature.
 */
export async function exchangeSeats(
  ticketA: string,
  ticketB: string,
  organiserId: string
): Promise<SwapResult> {
  if (!isAdminConfigured()) return refuse('unavailable', 'Seat changes are unavailable.');
  if (ticketA === ticketB) return refuse('no-ticket', 'Choose two different tickets.');

  const db = getAdminDb();

  try {
    return await db.runTransaction<SwapResult>(async (tx) => {
      const refA = db.collection('tickets').doc(ticketA);
      const refB = db.collection('tickets').doc(ticketB);
      const [snapA, snapB] = await Promise.all([tx.get(refA), tx.get(refB)]);

      if (!snapA.exists || !snapB.exists) return refuse('no-ticket', 'One of those tickets is gone.');

      const a = snapA.data() as TicketShape;
      const b = snapB.data() as TicketShape;

      if (a.eventId !== b.eventId) {
        return refuse('no-ticket', 'Those tickets are for different events.');
      }

      const eventSnap = await tx.get(db.collection('events').doc(a.eventId));
      if (eventSnap.data()?.organizerId !== organiserId) {
        return refuse('not-yours', 'That is not your event.');
      }

      if (a.status !== 'valid' || b.status !== 'valid') {
        return refuse('not-live', 'Both tickets must be valid and not yet used.');
      }

      const seatA = (a.seat ?? '').trim().toUpperCase();
      const seatB = (b.seat ?? '').trim().toUpperCase();
      if (!seatA || !seatB) return refuse('seat-taken', 'Both tickets need a seat to swap.');

      /*
       * Each person must be allowed in the seat they are moving into. Two tickets on the
       * same tier always pass; a stalls ticket and a circle ticket do not, and letting
       * them swap would move somebody into a seat they did not pay for — with no payment
       * anywhere to show for it.
       */
      const sections = (eventSnap.data()?.seating ?? []) as SeatingSection[];
      if (sections.length > 0) {
        const aCanSitInB = seatBelongsToTier(sections, a.tierId ?? '', seatB);
        const bCanSitInA = seatBelongsToTier(sections, b.tierId ?? '', seatA);
        if (!aCanSitInB || !bCanSitInA) {
          return refuse('wrong-tier', 'Those seats are on different ticket types.');
        }
      }

      const now = new Date().toISOString();
      tx.update(refA, { seat: seatB, seatMovedAt: now });
      tx.update(refB, { seat: seatA, seatMovedAt: now });

      return { ok: true, seat: seatB, previousSeat: seatA };
    });
  } catch (error) {
    reportError(error, { scope: 'seats.exchange', ticketA, ticketB });
    return refuse('unavailable', 'That swap could not be made.');
  }
}
