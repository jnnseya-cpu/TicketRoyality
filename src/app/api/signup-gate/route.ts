import { NextResponse } from 'next/server';

import { assessRisk, type RequestSignals } from '@/shared/security/humanity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The humanity gate for account creation (docs/11).
 *
 * Scoring happens here rather than in the browser for the obvious reason: a client
 * that decides whether it is a bot will always decide it is not. The form gathers
 * signals; the server reaches the verdict.
 *
 * This is the first of two layers and the weaker one. It stops naive automation —
 * scripted form fills, headless browsers driving the real page — but a determined
 * attacker can call Firebase Auth directly and never touch this route. The layer that
 * closes that hole is App Check, which enforces at the Firebase service itself
 * (`shared/security/appcheck.ts`), and it needs a reCAPTCHA Enterprise site key from
 * the console. Both are the same vendor; neither is a substitute for the other.
 */

interface GateRequest {
  email?: string;
  /** Milliseconds from form render to submit. */
  fillMillis?: number;
  /** True once the form has seen a real keystroke or focus event. */
  humanInteraction?: boolean;
  /** The hidden field. Only automation fills it. */
  honeypot?: string;
}

/** Addresses that are almost never a real customer creating a real account. */
const DISPOSABLE = [
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
];

const ROLE_PREFIXES = ['admin', 'info', 'support', 'noreply', 'no-reply', 'postmaster', 'webmaster'];

export async function POST(request: Request) {
  let body: GateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const [localPart = '', domain = ''] = email.split('@');

  const signals: RequestSignals = {
    // App Check is not enforced yet, so attestation is unknown rather than failed.
    // `assessRisk` treats absent as unproven, not hostile — an outdated cached token
    // on a real browser must not lock a real customer out.
    disposableEmail: DISPOSABLE.some((d) => domain === d || domain.endsWith(`.${d}`)),
    roleAddress: ROLE_PREFIXES.includes(localPart),
    fillMillis: body.fillMillis,
    humanInteraction: body.humanInteraction,
    honeypotTripped: Boolean(body.honeypot && body.honeypot.trim().length > 0),
  };

  const assessment = assessRisk(signals);

  // The reasons stay server-side. Telling a bot which signal it failed is free tuning
  // advice; the person on the other end gets a plain sentence instead.
  if (assessment.action === 'refuse') {
    console.warn('[signup-gate] refused', {
      score: assessment.score,
      band: assessment.band,
      reasons: assessment.reasons,
      domain,
    });
  }

  return NextResponse.json(
    {
      allowed: assessment.action !== 'refuse',
      action: assessment.action,
      // A human-facing sentence, never the rule that produced it.
      message:
        assessment.action === 'refuse'
          ? 'We could not verify this sign-up. If you are a person, please contact info@ticketroyality.com and we will sort it out.'
          : undefined,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
