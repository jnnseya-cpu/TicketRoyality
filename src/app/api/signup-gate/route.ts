import { NextResponse } from 'next/server';

import { assessRisk, type RequestSignals } from '@/shared/security/humanity';
import { attestationSignal } from '@/backend/security/attestation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The humanity gate for account creation (docs/11).
 *
 * Scoring happens here rather than in the browser for the obvious reason: a client
 * that decides whether it is a bot will always decide it is not. The form gathers
 * signals; the server reaches the verdict.
 *
 * ## What stops the direct path
 *
 * Signals alone stop naive automation — scripted form fills, headless browsers driving
 * the real page. They do nothing about an attacker calling Firebase Auth directly and
 * never touching this route.
 *
 * The proof-of-work attestation is what raises the cost of doing that in bulk: a
 * solved challenge is required to look like a normal request, it is single-use, and it
 * costs the same CPU on every attempt. It does not make the direct path impossible —
 * nothing free does — it makes ten thousand attempts cost hours instead of seconds.
 *
 * Absent attestation is scored as unproven rather than hostile, so an old tab or a
 * client we have not instrumented is not locked out.
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
    // Verified here, not trusted from the body: the header carries a signed challenge
    // and its solution, and the nonce is burned so it cannot be reused.
    attested: await attestationSignal(request),
    disposableEmail: DISPOSABLE.some((d) => domain === d || domain.endsWith(`.${d}`)),
    roleAddress: ROLE_PREFIXES.includes(localPart),
    fillMillis: body.fillMillis,
    humanInteraction: body.humanInteraction,
    honeypotTripped: Boolean(body.honeypot && body.honeypot.trim().length > 0),
  };

  const assessment = assessRisk(signals);

  /*
   * The bar to refuse a sign-up outright is deliberately higher than the generic
   * `severe` band.
   *
   * Every account created here lands in a queue a human reviews — an organiser cannot
   * publish until they are approved — so the cost of letting a doubtful sign-up through
   * is that somebody looks at it, while the cost of a wrong refusal is a real applicant
   * who is told they are not a person and does not come back. This file already argues
   * that asymmetry for the honeypot; the threshold should honour it too.
   *
   * 85 means the honeypot plus a second strong signal, or three independent ones. One
   * weak signal — a role address, an unproven attestation, a slow form — can no longer
   * combine into a refusal on its own.
   */
  const REFUSE_AT = 85;
  const refuse = assessment.score >= REFUSE_AT;

  // The reasons stay server-side. Telling a bot which signal it failed is free tuning
  // advice; the person on the other end gets a plain sentence instead.
  if (refuse) {
    console.warn('[signup-gate] refused', {
      score: assessment.score,
      band: assessment.band,
      reasons: assessment.reasons,
      domain,
    });
  }

  return NextResponse.json(
    {
      allowed: !refuse,
      action: assessment.action,
      // A human-facing sentence, never the rule that produced it.
      message: refuse
        ? 'We could not verify this sign-up. If you are a person, please contact info@ticketroyality.com and we will sort it out.'
        : undefined,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
