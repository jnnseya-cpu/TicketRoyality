import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Releases checkout holds whose window has expired, returning the inventory to sale.
 *
 * Runs every minute because a held seat is unsellable: on a fast-moving event a
 * five-minute sweep means five minutes of phantom sell-out while real buyers are
 * turned away. Persistence lands with the ticket_types.held work (docs/08 §8.8).
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  // TODO(D6): release expired holds once `held` is persisted. Reported as a no-op
  // rather than a success so the metric does not look healthy before it works.
  return NextResponse.json({ released: 0, implemented: false }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
