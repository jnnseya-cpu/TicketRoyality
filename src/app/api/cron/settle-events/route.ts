import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { settleFinishedEvents } from '@/backend/services/settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Settle finished events to their organisers' connected accounts, automatically.
 *
 * Without this, a payout only fires when an organiser opens their revenue page and presses
 * "Withdraw" — so the organiser who never opens it never gets paid. This is the schedule
 * that pays each finished event on its own. Idempotent by the per-event key, so running it
 * hourly settles each event exactly once and re-attempts only what is still owed (a payout
 * blocked before the organiser finished onboarding fires the run after they do).
 *
 * Refuses every unauthenticated caller (CRON_SECRET), like every other sweep. Does nothing
 * while Connect is off — it reports `connectOff` rather than claiming payouts it cannot make.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const result = await settleFinishedEvents();
  return NextResponse.json(
    { ...result, implemented: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
