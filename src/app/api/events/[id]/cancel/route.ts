import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { cancelEvent } from '@/backend/services/cancellation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel an event. Organiser-only, verified against the event's own record — and the
 * heavy lifting (stopping the sale, starting the refunds, the notices) lives in the
 * service, inside its own guarantees. This route is a doorway, not a decision.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { id } = await context.params;
  const result = await cancelEvent(id, caller.uid);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, summary: result.summary });
}
