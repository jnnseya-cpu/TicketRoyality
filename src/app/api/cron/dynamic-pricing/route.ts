import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { sweepAutoPricing } from '@/backend/services/dynamic-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Automatic dynamic pricing sweep.
 *
 * Evaluates every event with automatic pricing on, applies the rule changes within the
 * organiser's baseline-anchored caps, and notifies the organiser (who can undo). Runs on
 * a schedule rather than on every sale because the rules are about trend — stock left,
 * sales since the last check, days to go — not about one ticket, and a per-sale hook
 * would reprice under a buyer mid-session. Nothing here charges anyone; it only sets the
 * price the next buyer sees.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const result = await sweepAutoPricing();

  return NextResponse.json(
    { ...result, implemented: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
