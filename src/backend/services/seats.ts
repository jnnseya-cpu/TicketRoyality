import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { SEAT_LOCKS } from '@/backend/services/holds';
import { bestAvailable, type Allocation } from '@/shared/seating';
import type { SeatingSection } from '@/shared/types';

/**
 * Which seats are gone.
 *
 * ## Derived from tickets, not from a ledger
 *
 * A separate "seat is taken" record would need something to delete it when a ticket is
 * refunded, and the refund runs in `functions/` — a separate deployable that cannot
 * import this module. A record nothing removes is a seat that can never be resold, and
 * that failure is invisible until a theatre wonders why row F never fills.
 *
 * So the answer is computed: a seat is gone if a **live ticket** carries it, or if a
 * **checkout is holding it right now**. Refund a ticket and the seat comes back with no
 * repair step, because there was never a second thing to repair.
 *
 * ## Why the route exists at all
 *
 * `firestore.rules` restricts ticket reads to the buyer, the event's organiser and
 * administrators — correctly, since a ticket carries a name and an email. A public seat
 * map therefore cannot read tickets from the browser, and should not: what a buyer needs
 * is which seats are free, not who is in them.
 */
export async function takenSeats(eventId: string): Promise<string[]> {
  if (!isAdminConfigured()) return [];

  const db = getAdminDb();

  try {
    const [tickets, locks] = await Promise.all([
      db
        .collection('tickets')
        .where('eventId', '==', eventId)
        // Refunded and cancelled deliberately excluded: that seat is for sale again.
        .where('status', 'in', ['valid', 'redeemed'])
        .limit(5000)
        .get(),
      db.collection(SEAT_LOCKS).where('eventId', '==', eventId).limit(5000).get(),
    ]);

    const taken = new Set<string>();
    for (const doc of tickets.docs) {
      const seat = doc.data()?.seat;
      if (typeof seat === 'string' && seat.trim()) taken.add(seat.trim().toUpperCase());
    }
    for (const doc of locks.docs) {
      const seat = doc.data()?.seat;
      if (typeof seat === 'string' && seat.trim()) taken.add(seat.trim().toUpperCase());
    }

    return [...taken].sort();
  } catch (error) {
    reportError(error, { scope: 'seats.taken', eventId });
    /*
     * Fails **closed** on the map, by design.
     *
     * An empty list here would draw every seat as free, and the buyer would pick one that
     * is already sold. They would then be refused at checkout — which is safe, because the
     * seat lock is the real authority — but the experience is choosing a seat and being
     * told no. The route reports the outage instead, and the map says so.
     */
    throw error;
  }
}

/**
 * "Just give me the best seats."
 *
 * ## Why this runs on the server
 *
 * Not because the arithmetic is secret — `shared/seating.ts` is in the bundle and the
 * choosing is deliberately explainable. It runs here because the map it chooses from must
 * be the current one: a browser holding a five-minute-old list would confidently recommend
 * a seat that sold four minutes ago, and the buyer would be refused at the till having
 * been told this was the best available.
 *
 * ## It reserves nothing
 *
 * A suggestion is not a hold. Reserving on a suggestion would let anyone empty a house by
 * refreshing the page, so the seats are taken at checkout by the same transaction that
 * takes a hand-picked seat — and if one of them went in between, the buyer is told and
 * asked again. Returns `null` when the event has no seat map, which is not an error: most
 * events do not.
 */
export async function suggestSeats(
  eventId: string,
  tierId: string,
  quantity: number,
  taken?: string[]
): Promise<Allocation | null> {
  if (!isAdminConfigured()) return null;

  try {
    const snap = await getAdminDb().collection('events').doc(eventId).get();
    const sections = (snap.data()?.seating ?? []) as SeatingSection[];
    if (sections.length === 0) return null;

    return bestAvailable(sections, tierId, quantity, taken ?? (await takenSeats(eventId)));
  } catch (error) {
    reportError(error, { scope: 'seats.suggest', eventId, tierId });
    // The map still works and the buyer can still choose by hand, so this fails to
    // "no suggestion" rather than taking the whole page down with it.
    return null;
  }
}
