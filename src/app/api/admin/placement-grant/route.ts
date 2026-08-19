import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { placementById } from '@/shared/placements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The superuser places (or removes) ANY event in any of the three slots, free — the
 * owner's control alongside the paid self-serve flow. A manual grant carries no
 * expiry, so the sweep never ends it: it stands until a superuser removes it.
 *
 * Server-side with the Admin SDK rather than a client write, because `spotlight` and
 * `newsletterSpotlight` are new flags the security rules were never taught to
 * whitelist — and an admin surface that silently half-works is worse than none.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 503 });
  }

  let body: { eventId?: unknown; placement?: unknown; active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const placement = placementById(String(body.placement ?? ''));
  const active = body.active === true;

  if (!eventId) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
  if (!placement) return NextResponse.json({ error: 'Unknown placement.' }, { status: 400 });

  const ref = getAdminDb().collection('events').doc(eventId);

  try {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'No such event.' }, { status: 404 });

    if (placement.id === 'video-ad') {
      await ref.update({ spotlight: active, spotlightUntil: null });
    } else if (placement.id === 'featured') {
      // Granting consumes any standing request; removing leaves no stale hand raised.
      await ref.update({ featured: active, featuredUntil: null, featuredRequested: false });
    } else {
      await ref.update({ newsletterSpotlight: active });
    }
  } catch {
    return NextResponse.json({ error: 'Could not update the event.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, eventId, placement: placement.id, active });
}
