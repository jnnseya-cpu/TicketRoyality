import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { membershipFor } from '@/backend/services/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The caller's own standing with one organiser.
 *
 * Always the caller's — never a `userId` from the query, which would turn this into a
 * lookup of how often any given person attends a given promoter's events. That is a
 * profile, and it is exactly what the reporting boundary exists to refuse.
 *
 * The buy box uses this to explain why a members' tier is unavailable. It is not what
 * decides the sale: checkout recomputes it server-side when the card is charged.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const organizerId = new URL(request.url).searchParams.get('organizerId');
  if (!organizerId) return NextResponse.json({ error: 'Which organiser?' }, { status: 400 });

  return NextResponse.json(
    { membership: await membershipFor(organizerId, caller.uid) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
