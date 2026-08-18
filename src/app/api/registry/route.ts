import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { contributionsFor, createItem, itemsFor } from '@/backend/services/registry';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The gift list.
 *
 * ## Who the guests are is the organiser's business, not the other guests'
 *
 * The public list returns what is needed to give — the item, the target, how much is left
 * — and no names. Who gave what goes to the couple through the authenticated view,
 * because a wedding list that shows every guest what every other guest spent is a
 * different, worse product.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;

  if (query.get('view') === 'contributions') {
    const caller = await requireUser(request);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
    return NextResponse.json({ contributions: await contributionsFor(caller.uid) });
  }

  const eventId = query.get('eventId') ?? '';
  if (!eventId) return NextResponse.json({ error: 'Which event?' }, { status: 400 });

  const items = await itemsFor(eventId);

  return NextResponse.json(
    {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        currency: item.currency,
        targetMinor: item.targetMinor,
        raisedMinor: item.raisedMinor ?? 0,
        remainingMinor: Math.max(0, item.targetMinor - (item.raisedMinor ?? 0)),
        contributionCount: item.contributionCount ?? 0,
        allowPartial: item.allowPartial !== false,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 });
  }

  // The list belongs to the event's organiser, checked against the stored event rather
  // than taken from the body.
  const event = await getAdminDb().collection('events').doc(eventId).get();
  if (event.data()?.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  const id = await createItem({
    eventId,
    organizerId: caller.uid,
    title: String(body.title ?? '').slice(0, 140),
    description: body.description ? String(body.description).slice(0, 1000) : undefined,
    imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
    targetMinor: Math.round(Number(body.targetMinor) || 0),
    allowPartial: body.allowPartial !== false,
    currency: String(event.data()?.currency ?? 'GBP'),
  });

  return id
    ? NextResponse.json({ ok: true, id })
    : NextResponse.json({ error: 'Could not add that gift.' }, { status: 503 });
}
