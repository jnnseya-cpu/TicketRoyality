import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { isConnectConfigured } from '@/backend/payments/stripe-connect';
import { settleOrganiserEvent } from '@/backend/services/settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Settle an organiser's finished events to their Connect account — the per-event payout.
 *
 * Walks the organiser's own past events and settles each once, keyed by the event, so a
 * second press pays nothing again. Refuses cleanly when Connect is off or the organiser has
 * not onboarded — the money stays owed and visible rather than moving or pretending to.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  if (!isConnectConfigured()) {
    return NextResponse.json({ error: 'Automatic payouts are not enabled yet.' }, { status: 503 });
  }

  // The organiser's own events (single-field query, no composite index), finished ones only.
  const snap = await getAdminDb()
    .collection('events')
    .where('organizerId', '==', caller.uid)
    .get();
  const now = Date.now();
  const pastEventIds = snap.docs
    .filter((d) => {
      const date = d.data()?.date;
      return date && new Date(date).getTime() <= now;
    })
    .map((d) => d.id);

  let paid = 0;
  let blocked = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const eventId of pastEventIds) {
    const result = await settleOrganiserEvent(caller.uid, eventId);
    if (result.ok && result.status === 'paid') paid += 1;
    else if (result.ok && result.status === 'already-settled') continue;
    else if (!result.ok && result.status === 'blocked') blocked += 1;
    else if (!result.ok) {
      failed += 1;
      if (result.error) errors.push(result.error);
    }
  }

  return NextResponse.json({ paid, blocked, failed, errors: errors.slice(0, 3) });
}
