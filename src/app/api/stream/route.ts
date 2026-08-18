import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import {
  hideChatMessage,
  postChatMessage,
  recordStreamView,
  streamAccessFor,
} from '@/backend/services/streaming';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stream access and chat.
 *
 * `GET` returns the embed URL **only** when the caller holds a ticket. That is the entire
 * point of the route existing: the URL is never rendered into a page a non-holder can
 * load, so there is nothing to find in the source.
 *
 * Never cached. A cached response is a stream URL sitting at an edge for the next person.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Which event?' }, { status: 400 });

  const access = await streamAccessFor(eventId, caller.uid);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, reason: access.reason, opensAt: access.opensAt },
      { status: access.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Counted after the decision, never before: a refused viewer is not an audience figure.
  await recordStreamView(eventId, access.ticketId, caller.uid);

  return NextResponse.json(
    {
      streamUrl: access.streamUrl,
      chatEnabled: access.chatEnabled,
      isReplay: access.isReplay,
      name: access.attendeeName,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { action?: 'chat' | 'hide'; eventId?: string; text?: string; messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');

  if (body.action === 'hide') {
    const ok = await hideChatMessage(String(body.messageId ?? ''), eventId, caller.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  const result = await postChatMessage(eventId, caller.uid, String(body.text ?? ''));
  return result.ok
    ? NextResponse.json({ ok: true, id: result.id })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
