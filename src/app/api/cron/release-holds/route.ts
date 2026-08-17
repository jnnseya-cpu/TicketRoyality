import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { expireHolds } from '@/backend/services/holds';

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

  return NextResponse.json(
    { released, implemented: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
