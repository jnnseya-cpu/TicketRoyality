import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { acceptTransfer, cancelTransfer, startTransfer } from '@/backend/services/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ticket transfer. Every action proves who the caller is from a verified token.
 *
 * Ownership is checked in the service against the ticket document, never from the
 * request: a route that accepted a `fromUserId` would let anyone give away anyone's
 * ticket.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    action?: 'start' | 'accept' | 'cancel';
    ticketId?: string;
    toEmail?: string;
    transferId?: string;
    token?: string;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'start') {
    const result = await startTransfer(
      String(body.ticketId ?? ''),
      caller.uid,
      String(body.toEmail ?? '')
    );
    return result.ok
      ? NextResponse.json({ ok: true, transferId: result.transferId })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'accept') {
    if (!caller.email) {
      return NextResponse.json(
        { error: 'Your account has no email address to receive a ticket at.' },
        { status: 400 }
      );
    }
    const result = await acceptTransfer(
      String(body.transferId ?? ''),
      String(body.token ?? ''),
      caller.uid,
      String(body.name ?? '').trim() || caller.email,
      caller.email
    );
    return result.ok
      ? NextResponse.json({ ok: true, ticketId: result.ticketId })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'cancel') {
    const ok = await cancelTransfer(String(body.transferId ?? ''), caller.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That transfer could not be cancelled.' }, { status: 409 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
