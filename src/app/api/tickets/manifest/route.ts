import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { ManifestTicket } from '@/shared/tickets/offline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The offline door manifest.
 *
 * ## Why this carries rotation seeds, and what that costs
 *
 * A door with no signal can only check a rotating code if it holds the ticket's seed.
 * Without seeds, offline mode admits any screenshot — which is what most offline modes
 * quietly do, because the alternative requires shipping the secret.
 *
 * So it ships the secret, to a device that is already the organiser's door: the request
 * needs a verified token, the caller must own the event, and only tickets for that one
 * event come back. A lost staff phone is a real exposure and the honest mitigation is
 * that it is bounded to one event, expires with it, and the app clears the manifest when
 * the event is over.
 *
 * Never cached: a manifest served from an edge is a list that is missing whoever bought
 * a ticket since.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Which event?' }, { status: 400 });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  const db = getAdminDb();
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) return NextResponse.json({ error: 'No such event.' }, { status: 404 });

  // Ownership, or an administrator. Same rule as the door itself.
  const isOwner = eventSnap.data()?.organizerId === caller.uid;
  const isAdmin = (await db.collection('users').doc(caller.uid).get()).data()?.userType === 'superuser';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  const snap = await db
    .collection('tickets')
    .where('eventId', '==', eventId)
    .where('status', '==', 'valid')
    .limit(20_000)
    .get();

  const tickets: ManifestTicket[] = snap.docs.map((doc) => {
    const t = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      reference: String(t.reference ?? ''),
      attendeeName: String(t.attendeeName ?? 'Attendee'),
      tierName: String(t.tierName ?? 'Ticket'),
      ...(t.seat ? { seat: String(t.seat) } : {}),
      status: String(t.status ?? 'valid'),
      ...(t.rotationSeed ? { rotationSeed: String(t.rotationSeed) } : {}),
      ...(t.qrSignature ? { qrSignature: String(t.qrSignature) } : {}),
    };
  });

  return NextResponse.json(
    {
      eventId,
      eventTitle: String(eventSnap.data()?.title ?? 'Event'),
      fetchedAt: new Date().toISOString(),
      tickets,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
