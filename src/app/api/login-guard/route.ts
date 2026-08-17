import { NextResponse } from 'next/server';

import { callerIp, checkLogin, clearAttempts, recordFailure } from '@/backend/security/login-guard';
import { attestationSignal } from '@/backend/security/attestation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Login throttling for `/login` and `/login/admin`.
 *
 * The client asks before attempting a sign-in and reports the outcome afterwards, so the
 * server owns the counters. A client that skipped the check would still hit Firebase
 * Auth's own limits.
 *
 * ## Attestation tightens the limit rather than gating the door
 *
 * An unattested attempt is throttled harder — half the budget — instead of being
 * refused. Refusing outright would lock out anyone whose browser could not complete the
 * proof, and the person most likely to be on a device that struggles is not the
 * attacker. Credential stuffing pays the proof-of-work cost on every attempt or accepts
 * a much smaller allowance; a real customer who fails it once still gets in.
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

  const attested = await attestationSignal(request);
  const verdict = await checkLogin(identifier, ip, 'login', attested === true ? 1 : 0.5);

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
