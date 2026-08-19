import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { clearConsumedSeatLocks, expireHolds, expireStaleCartOrders } from '@/backend/services/holds';
import { expireLapsedBookings } from '@/backend/services/hospitality';
import { purgeSpentAttestations } from '@/backend/security/attestation';
import { closeDueLots } from '@/backend/services/auctions';
import { deliverDue } from '@/backend/services/webhooks';
import { expirePlacements } from '@/backend/services/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Releases checkout holds whose window has expired, returning the inventory to sale.
 *
 * Runs every minute because a held seat is unsellable: on a fast-moving event a
 * five-minute sweep means five minutes of phantom sell-out while real buyers are
 * turned away.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const released = await expireHolds();

  /*
   * Then reconcile hospitality to match.
   *
   * The sweep above is the authority on inventory: when a balance is never paid it takes
   * the covers back and the table is sellable again. Leaving the booking document
   * claiming a table it no longer holds is how two parties end up at one table.
   */
  const bookingsExpired = await expireLapsedBookings();

  /*
   * Seat locks left behind by a hold issuance consumed.
   *
   * Once the tickets exist the lock is redundant — the seat is taken because a ticket
   * says so — and leaving it would mean a refunded seat could never be resold, because
   * nothing else ever deletes it.
   */
  const seatLocksCleared = await clearConsumedSeatLocks();

  /* Spent attestation nonces, once they are older than any challenge could still be
     valid. Keeping them forever would grow a collection whose only job is to refuse a
     replay that expiry already refuses. */
  const attestationsPurged = await purgeSpentAttestations();

  /*
   * Auction lots whose time is up.
   *
   * Closed by the clock rather than by somebody remembering to press a button, because
   * the one evening nobody presses it is the evening the auction runs until morning. A
   * lot that never reached its reserve closes unsold — the reserve is the organiser's
   * floor, and selling below it is selling something they said they would not.
   */
  const lotsClosed = (await closeDueLots()).length;

  /*
   * Outbound webhooks that are due — first attempts and retries alike.
   *
   * Sent from here rather than from the sale path: a ticket is issued whether or not
   * somebody else's server answers, and nothing that takes money may wait on it.
   */
  const webhooks = await deliverDue();

  /*
   * Paid homepage placements whose term has lapsed. Swept here because this is the one
   * schedule that demonstrably runs — `/api/cron/expire-placements` exists for a manual
   * or separately scheduled call, but a slot bought for 7 days must not depend on a
   * second scheduler job anybody has to remember to create.
   */
  const placementsExpired = (await expirePlacements()).expired;

  /* Basket order documents whose checkout died — bookkeeping, no inventory involved. */
  const cartOrdersAbandoned = await expireStaleCartOrders();

  return NextResponse.json(
    {
      released,
      bookingsExpired,
      seatLocksCleared,
      attestationsPurged,
      lotsClosed,
      webhooks,
      placementsExpired,
      cartOrdersAbandoned,
      implemented: true,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
