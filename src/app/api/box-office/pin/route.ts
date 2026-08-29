import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { boxOfficePinSet, setBoxOfficePin } from '@/backend/services/box-office';

export const dynamic = 'force-dynamic';

/** Organiser sets or rotates the door PIN for one of their events. */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { eventId?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const result = await setBoxOfficePin(String(body.eventId ?? ''), caller.uid, String(body.pin ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Whether a door PIN is armed for an event the caller owns (dashboard status). */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const eventId = new URL(request.url).searchParams.get('eventId') ?? '';
  if (!eventId) return NextResponse.json({ error: 'Missing event.' }, { status: 400 });
  return NextResponse.json({ armed: await boxOfficePinSet(eventId) });
}
