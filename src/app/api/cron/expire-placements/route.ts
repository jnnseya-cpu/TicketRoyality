import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { expirePlacements } from '@/backend/services/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Expires paid placements whose term has ended — the homepage spotlight strip and
 * featured events (docs/04 M24).
 *
 * Hourly is enough: a placement running an extra fifty minutes costs us nothing and
 * the advertiser nothing. The `…Until` timestamps exist precisely so a missed run
 * cannot leave a slot live indefinitely — and a manual grant carries none, so only
 * paid time runs out.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const result = await expirePlacements();

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
