import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Expires paid placements whose term has ended — homepage video slots and featured
 * events (docs/04 M24).
 *
 * Hourly is enough: a placement running an extra fifty minutes costs us nothing and
 * the advertiser nothing. `featured_until` is a timestamp precisely so a missed run
 * cannot leave a slot live indefinitely.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  return NextResponse.json({ expired: 0, implemented: false }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
