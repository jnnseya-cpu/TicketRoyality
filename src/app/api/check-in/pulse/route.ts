import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live cross-door admissions for one event.
 *
 * A door scanner knows what *it* admitted. This is what every *other* door admitted — a
 * running admitted count and the most recent entries across the whole venue — so staff on
 * one gate have situational awareness of the rest without re-scanning anything.
 *
 * Server-mediated on purpose: the check-in page is authorised as the event's organiser, so
 * this reads through the Admin SDK after proving ownership, by a single-field `eventId`
 * query that needs no composite index (the deploy stays simple). The genuinely-offline door
 * cannot see this — that is physics, not a gap — and the scanner degrades to its own local
 * view when the poll fails.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Missing event.' }, { status: 400 });

  const db = getAdminDb();

  // Prove the caller owns this event before returning anyone's admissions.
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists || eventSnap.data()?.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'Not your event.' }, { status: 403 });
  }

  // Single-field query, filtered in memory — no composite index, so nothing new to deploy.
  const snap = await db.collection('tickets').where('eventId', '==', eventId).get();

  let admitted = 0;
  let issued = 0;
  const recentAll: Array<{ reference: string; at: string; tier: string; gate?: string }> = [];
  for (const doc of snap.docs) {
    const t = doc.data() as {
      status?: string;
      redeemedAt?: string;
      reference?: string;
      tierName?: string;
      redeemedGate?: string;
    };
    issued += 1;
    if (t.status === 'redeemed') {
      admitted += 1;
      if (t.redeemedAt) {
        recentAll.push({
          reference: String(t.reference ?? ''),
          at: t.redeemedAt,
          tier: String(t.tierName ?? ''),
          ...(t.redeemedGate ? { gate: String(t.redeemedGate) } : {}),
        });
      }
    }
  }

  const recent = recentAll.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  return NextResponse.json({ admitted, issued, recent });
}
