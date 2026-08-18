import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { exchangeSeats, moveSeat } from '@/backend/services/seat-swap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changing where somebody sits, after they have paid.
 *
 * Every decision is made in `seat-swap.ts` inside a transaction — who may move this
 * ticket, whether the destination is on their tier, and whether anybody else got there
 * first. Nothing here is trusted from the body except the ids, and the person asking is
 * always the verified token rather than a field.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { action?: string; ticketId?: string; seat?: string; withTicketId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const result =
    body.action === 'exchange'
      ? await exchangeSeats(String(body.ticketId ?? ''), String(body.withTicketId ?? ''), caller.uid)
      : await moveSeat(String(body.ticketId ?? ''), String(body.seat ?? ''), caller.uid);

  if (result.ok) return NextResponse.json(result);

  /*
   * "Taken" is a 409 rather than a 400: nothing about the request was wrong, somebody
   * else simply got there first, and the difference matters to anything retrying.
   */
  const status =
    result.reason === 'not-yours'
      ? 403
      : result.reason === 'no-ticket'
        ? 404
        : result.reason === 'seat-taken'
          ? 409
          : result.reason === 'unavailable'
            ? 503
            : 400;

  return NextResponse.json({ error: result.error, reason: result.reason }, { status });
}
