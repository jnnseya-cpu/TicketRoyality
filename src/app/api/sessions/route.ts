import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { agendaFor, cancelSessionRegistration, registerForSession } from '@/backend/services/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Session registration.
 *
 * Ownership of the ticket is checked inside the service, against the ticket document —
 * never from the request. A route that took a `userId` would let anyone fill a workshop
 * with other people's tickets, which is the cheapest possible denial of service against
 * a conference.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const ticketId = new URL(request.url).searchParams.get('ticketId');
  if (!ticketId) return NextResponse.json({ error: 'Which ticket?' }, { status: 400 });

  return NextResponse.json({ sessionIds: await agendaFor(ticketId) });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { action?: 'register' | 'cancel'; eventId?: string; sessionId?: string; ticketId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');
  const sessionId = String(body.sessionId ?? '');
  const ticketId = String(body.ticketId ?? '');

  if (body.action === 'cancel') {
    const ok = await cancelSessionRegistration(eventId, sessionId, ticketId, caller.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That place could not be released.' }, { status: 404 });
  }

  const result = await registerForSession(eventId, sessionId, ticketId, caller.uid);
  return result.ok
    ? NextResponse.json({
        ok: true,
        registered: result.registered,
        capacity: result.capacity,
        sessionTitle: result.sessionTitle,
      })
    : NextResponse.json({ error: result.error, kind: result.kind }, { status: result.status });
}
