import { NextResponse } from 'next/server';

import { callerIp, checkLogin, clearAttempts, recordFailure } from '@/backend/security/login-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Login throttling for `/login` and `/login/admin`.
 *
 * The client asks before attempting a sign-in and reports the outcome afterwards, so the
 * server owns the counters. A client that skipped the check would still hit Firebase
 * Auth's own limits, and App Check is the layer that closes the direct path properly —
 * see `backend/security/login-guard.ts`.
 *
 * The response deliberately says nothing about whether the account exists. A throttle
 * that answers differently for a real address than an invented one is an account
 * enumeration oracle wearing a security feature's clothes.
 */
export async function POST(request: Request) {
  let body: { identifier?: string; outcome?: 'attempt' | 'failed' | 'succeeded' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const identifier = String(body.identifier ?? '').trim();
  if (!identifier) return NextResponse.json({ allowed: true });

  const ip = callerIp(request);

  if (body.outcome === 'failed') {
    await recordFailure(identifier, ip);
    return NextResponse.json({ recorded: true });
  }

  if (body.outcome === 'succeeded') {
    await clearAttempts(identifier, ip);
    return NextResponse.json({ cleared: true });
  }

  const verdict = await checkLogin(identifier, ip);

  return verdict.allowed
    ? NextResponse.json({ allowed: true })
    : NextResponse.json(
        {
          allowed: false,
          retryAfter: verdict.retryAfter,
          error:
            verdict.reason === 'network'
              ? 'Too many sign-in attempts from this connection. Try again shortly.'
              : 'Too many sign-in attempts. Try again in a few minutes, or reset your password.',
        },
        { status: 429, headers: { 'Retry-After': String(verdict.retryAfter ?? 60) } }
      );
}
