import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { setAccessCodes, tiersWithCodes, unlock } from '@/backend/services/access-codes';
import { callerIp } from '@/backend/security/login-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Access codes for hidden ticket types.
 *
 * `POST` is the buyer redeeming a code — open to anyone, because most people given a
 * corporate rate have never signed in here, and throttled in its own namespace.
 *
 * `PUT` is the organiser setting them, and proves ownership of the event from a verified
 * token rather than from the request body.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const result = await unlock(id, String(body.code ?? ''), callerIp(request));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        ...(result.retryAfter ? { headers: { 'Retry-After': String(result.retryAfter) } } : {}),
      }
    );
  }

  return NextResponse.json({ ok: true, tierIds: result.tierIds });
}

/** The organiser's view: which tiers have a code, never what the codes are. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }
  const snap = await getAdminDb().collection('events').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
  if (snap.data()?.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  return NextResponse.json({ tierIds: await tiersWithCodes(id) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { codes?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }
  const snap = await getAdminDb().collection('events').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
  if (snap.data()?.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  const ok = await setAccessCodes(id, body.codes ?? {});
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Could not save those codes.' }, { status: 503 });
}
