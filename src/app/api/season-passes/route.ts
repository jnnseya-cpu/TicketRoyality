import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { createPass, listPasses, passAvailability } from '@/backend/services/season-passes';
import { membershipFor } from '@/backend/services/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Season passes.
 *
 * `GET` without a caller-owned scope returns the passes for one organiser — public,
 * because a pass is a thing on sale and hiding it from anyone not signed in would be
 * hiding the product. Creating one requires the token, and every covered event is checked
 * against that organiser: a pass that took a tier from somebody else's event would sell
 * their inventory.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizerId = url.searchParams.get('organizerId');
  const passId = url.searchParams.get('passId');

  if (passId) return NextResponse.json({ availability: await passAvailability(passId) });

  if (organizerId) {
    const passes = (await listPasses(organizerId)).filter((p) => p.active);
    return NextResponse.json({ passes });
  }

  // No scope given: the caller's own, which needs a token.
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  return NextResponse.json({
    passes: await listPasses(caller.uid),
    // The caller's standing with themselves is meaningless; this is here so an organiser
    // can see what their own gates would do.
    membership: await membershipFor(caller.uid, caller.uid),
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    name?: string;
    description?: string;
    price?: number;
    currency?: string;
    quantity?: number;
    eventIds?: string[];
    tierIds?: Record<string, string>;
    renewsPassId?: string;
    holderWindowEnds?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventIds = Array.isArray(body.eventIds) ? body.eventIds.slice(0, 60) : [];
  if (eventIds.length === 0) {
    return NextResponse.json({ error: 'Choose the events it covers.' }, { status: 400 });
  }

  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  // Every covered event must be this organiser's. Otherwise a pass sells somebody
  // else's seats and the first they know is a stranger at their door.
  const db = getAdminDb();
  for (const eventId of eventIds) {
    const snap = await db.collection('events').doc(eventId).get();
    if (!snap.exists || snap.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
    }
  }

  // A renewal may only point at this organiser's own earlier pass — otherwise the window
  // would gate on a stranger's holders. Both fields travel together or not at all.
  let renewsPassId: string | undefined;
  let holderWindowEnds: string | undefined;
  if (body.renewsPassId && body.holderWindowEnds) {
    const prev = await db.collection('season_passes').doc(String(body.renewsPassId)).get();
    if (!prev.exists || prev.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'That is not your pass to renew.' }, { status: 403 });
    }
    const ends = new Date(String(body.holderWindowEnds));
    if (Number.isNaN(ends.getTime()) || ends.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The holder window must end in the future.' }, { status: 400 });
    }
    renewsPassId = String(body.renewsPassId);
    holderWindowEnds = ends.toISOString();
  }

  const result = await createPass({
    organizerId: caller.uid,
    name: String(body.name ?? '').trim().slice(0, 120),
    description: body.description ? String(body.description).slice(0, 500) : undefined,
    price: Math.max(0, Number(body.price) || 0),
    currency: String(body.currency ?? 'GBP'),
    quantity: Math.max(1, Math.floor(Number(body.quantity) || 1)),
    eventIds,
    tierIds: body.tierIds ?? {},
    active: true,
    ...(renewsPassId ? { renewsPassId, holderWindowEnds } : {}),
  });

  return result.ok
    ? NextResponse.json({ ok: true, id: result.id })
    : NextResponse.json({ error: result.error }, { status: 400 });
}
