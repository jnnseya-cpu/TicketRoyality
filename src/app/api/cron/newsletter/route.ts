import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The batch is bounded, but SMTP is slow and 25 sequential sends can take a while.
export const maxDuration = 300;

/**
 * One batch of the weekly newsletter.
 *
 * Scheduled every fifteen minutes rather than weekly, deliberately: each call sends a
 * small batch and advances a cursor, so a list of any size drains over hours instead of
 * hitting the Hostinger mailbox's hourly cap in one blast. What breaks after that cap
 * is not the newsletter — it is the ticket somebody just paid for.
 *
 * Calls outside the weekly window are cheap no-ops: the run for the current week
 * completes and every later call returns immediately.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const { sendNewsletterBatch } = await import('@/backend/newsletter/send');
  const result = await sendNewsletterBatch();

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
