import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { addBlock, listBlocks, removeBlock } from '@/backend/services/blocklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The door blocklist.
 *
 * The organiser is always taken from the verified token, never from the body: a route
 * that accepted an `organizerId` would let anyone bar anyone else's customers. An entry
 * scoped to one event is checked against that event's ownership as well, so an organiser
 * cannot attach a block to somebody else's door.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  return NextResponse.json({ entries: await listBlocks(caller.uid) });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { kind?: 'email' | 'reference'; value?: string; reason?: string; eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.eventId) {
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    const snap = await getAdminDb().collection('events').doc(body.eventId).get();
    if (!snap.exists || snap.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
    }
  }

  const result = await addBlock({
    organizerId: caller.uid,
    eventId: body.eventId,
    kind: body.kind === 'reference' ? 'reference' : 'email',
    value: String(body.value ?? ''),
    reason: String(body.reason ?? ''),
    createdBy: caller.uid,
  });

  return result.ok
    ? NextResponse.json({ ok: true, id: result.id })
    : NextResponse.json({ error: result.error }, { status: 400 });
}

export async function DELETE(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  const ok = await removeBlock(id, caller.uid);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'That entry could not be removed.' }, { status: 404 });
}
