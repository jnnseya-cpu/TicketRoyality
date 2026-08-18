import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { tierForAttendance } from '@/shared/loyalty-tiers';
import type { Membership } from '@/shared/types';

/**
 * Loyalty, computed rather than stored.
 *
 * ## Why there is no points balance
 *
 * A stored counter needs something to decrement it when a ticket is refunded, and there
 * is nothing — the refund runs in `functions/`, a separate deployable. A balance that
 * only ever goes up would eventually reward somebody for orders they cancelled, and the
 * first anyone would hear is a customer arguing at a presale.
 *
 * So a tier is derived from live tickets each time it is asked for. It cannot drift,
 * there is nothing to migrate, and a refund takes the loyalty back on its own.
 *
 * ## Counted by events attended, not tickets bought
 *
 * Somebody who buys four tickets to one show is a group of friends, not a returning
 * customer. Counting tickets would hand the best presale window to whoever books for
 * their mates, which is precisely the wrong person to reward.
 *
 * ## Per organiser, never platform-wide
 *
 * Loyalty to a promoter is not loyalty to a theatre. A platform-wide tier would let one
 * organiser's regulars jump another organiser's presale queue, which is the organiser's
 * relationship to give away, not ours.
 */

/*
 * The ladder itself lives in `shared/loyalty-tiers.ts` so the buy box can explain a gate
 * with the same function the server enforces it with. Two implementations would
 * eventually disagree, and the customer would be told they qualify and then refused at
 * the payment page.
 */
export { meetsTier, tierForAttendance } from '@/shared/loyalty-tiers';

export async function membershipFor(organizerId: string, userId: string): Promise<Membership> {
  const empty: Membership = {
    organizerId,
    userId,
    eventsAttended: 0,
    hasSeasonPass: false,
    tier: 'none',
  };

  if (!isAdminConfigured() || !userId) return empty;

  try {
    const db = getAdminDb();
    const [tickets, passes] = await Promise.all([
      db
        .collection('tickets')
        .where('userId', '==', userId)
        .where('organizerId', '==', organizerId)
        .limit(1000)
        .get(),
      db
        .collection('season_pass_purchases')
        .where('userId', '==', userId)
        .where('organizerId', '==', organizerId)
        .limit(20)
        .get(),
    ]);

    const events = new Set<string>();
    for (const doc of tickets.docs) {
      const ticket = doc.data() as { status: string; eventId: string };
      // A refunded ticket is not attendance. Counting it would reward somebody for an
      // order they cancelled, which is the failure the whole derived model avoids.
      if (ticket.status === 'valid' || ticket.status === 'redeemed') events.add(ticket.eventId);
    }

    const hasSeasonPass = !passes.empty;
    return {
      organizerId,
      userId,
      eventsAttended: events.size,
      hasSeasonPass,
      tier: tierForAttendance(events.size, hasSeasonPass),
    };
  } catch (error) {
    reportError(error, { scope: 'loyalty.membership', organizerId, userId });
    /*
     * Fails to `none`, which refuses a gated presale rather than opening it.
     *
     * The opposite choice would open a members-only window to everybody during an
     * outage, and an early window given away cannot be taken back — the tickets are
     * gone. A member turned away can buy in the general sale an hour later.
     */
    return empty;
  }
}
