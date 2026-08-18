import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { applyOfflineRedemptions } from '@/backend/services/offline-sync';
import type { QueuedRedemption } from '@/shared/tickets/offline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Draining a door's offline queue.
 *
 * Authority is checked in the service against the event document. A route that trusted
 * the caller would let anybody mark a room's worth of tickets used.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { eventId?: string; queue?: QueuedRedemption[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const queue = Array.isArray(body.queue) ? body.queue.slice(0, 5000) : [];
  if (queue.length === 0) return NextResponse.json({ applied: 0, conflicts: [], unknown: [] });

  const outcome = await applyOfflineRedemptions(String(body.eventId ?? ''), caller.uid, queue);
  return outcome
    ? NextResponse.json(outcome)
    : NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
}
