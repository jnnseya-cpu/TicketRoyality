import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { markAllRead, markRead } from '@/backend/comms/inapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Marking notifications read.
 *
 * Reading the list does not go through here — the bell subscribes to Firestore directly,
 * so it updates live without polling, and `firestore.rules` already restricts the query
 * to the caller's own documents. This route exists for the writes, where the server
 * should be the one deciding whose notification is whose.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { id?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.all) {
    const count = await markAllRead(caller.uid);
    return NextResponse.json({ ok: true, marked: count });
  }

  if (!body.id) return NextResponse.json({ error: 'No notification given.' }, { status: 400 });

  const ok = await markRead(caller.uid, body.id);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'No such notification.' }, { status: 404 });
}
