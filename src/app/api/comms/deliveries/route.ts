import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { recentDeliveries, summarise } from '@/backend/comms/log';
import type { Channel, DeliveryStatus } from '@/shared/comms/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The delivery log, for the administration console.
 *
 * Administrators only, and deliberately not readable by the recipients themselves: each
 * record names an address and what was sent to it, so the collection as a whole is a
 * map of who the platform's customers are.
 */

const CHANNELS: Channel[] = ['email', 'inapp', 'sms', 'push', 'whatsapp'];
const STATUSES: DeliveryStatus[] = ['sent', 'logged', 'queued', 'failed', 'suppressed'];

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const status = url.searchParams.get('status');
  const eventKey = url.searchParams.get('eventKey');
  const limitParam = Number(url.searchParams.get('limit') ?? 100);

  const records = await recentDeliveries({
    // Clamped: an unbounded limit from a query string is a way to pull the entire log
    // into one response and time the request out.
    limit: Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100,
    // Validated against the unions rather than passed through, so an arbitrary string
    // cannot become a Firestore query on a field that was never indexed.
    channel: CHANNELS.includes(channel as Channel) ? (channel as Channel) : undefined,
    status: STATUSES.includes(status as DeliveryStatus) ? (status as DeliveryStatus) : undefined,
    eventKey: eventKey ?? undefined,
  });

  return NextResponse.json(
    { records, summary: summarise(records) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
