import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { admitByTag, bindTag, unbindTag } from '@/backend/services/wristbands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Wristbands: bind a tag to a ticket, admit on a tag, release a band.
 *
 * Every action proves the caller owns the event inside the service. A door that trusted
 * the request would let anybody mark a room's worth of tickets used.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { action?: 'bind' | 'admit' | 'unbind'; eventId?: string; tagUid?: string; reference?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');
  const tagUid = String(body.tagUid ?? '');

  if (body.action === 'bind') {
    const result = await bindTag(eventId, tagUid, String(body.reference ?? ''), caller.uid);
    return result.ok
      ? NextResponse.json({ ok: true, reference: result.reference, attendee: result.attendee })
      : NextResponse.json({ error: result.error, kind: result.kind }, { status: result.status });
  }

  if (body.action === 'unbind') {
    const ok = await unbindTag(eventId, tagUid, caller.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That band could not be released.' }, { status: 403 });
  }

  const result = await admitByTag(eventId, tagUid, caller.uid);
  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json(
        { error: result.error, kind: result.kind, reference: result.reference, redeemedAt: result.redeemedAt },
        { status: result.status }
      );
}
