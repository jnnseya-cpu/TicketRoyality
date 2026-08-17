import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { clearConsumedSeatLocks, expireHolds } from '@/backend/services/holds';
import { expireLapsedBookings } from '@/backend/services/hospitality';
import { purgeSpentAttestations } from '@/backend/security/attestation';

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

  return NextResponse.json(
    { released, bookingsExpired, seatLocksCleared, attestationsPurged, implemented: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
