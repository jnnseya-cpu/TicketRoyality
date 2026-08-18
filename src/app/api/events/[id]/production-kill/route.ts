import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { killSeats, openCases, resolveCase } from '@/backend/services/production-kill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** docs/25 §43–44. Ownership is checked in the service against the stored event. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { id } = await context.params;
  return NextResponse.json({ cases: await openCases(id, caller.uid) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { id } = await context.params;

  let body: { action?: string; seats?: string[]; reason?: string; caseId?: string; toSeat?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'resolve') {
    const result = await resolveCase(String(body.caseId ?? ''), caller.uid, String(body.toSeat ?? ''));
    return result.ok
      ? NextResponse.json(result)
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  const seats = Array.isArray(body.seats) ? body.seats.map(String).slice(0, 300) : [];
  if (seats.length === 0) return NextResponse.json({ error: 'Name the seats.' }, { status: 400 });

  const result = await killSeats(id, caller.uid, seats, String(body.reason ?? 'production').slice(0, 200));
  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
