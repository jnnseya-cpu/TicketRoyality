'use client';

import { solve, type PowChallenge } from '@/shared/security/pow';

/**
 * Fetch a challenge, solve it, and hand back the header value.
 *
 * ## Solved when the form opens, not when it is submitted
 *
 * `prewarm()` starts the work as soon as a form is rendered, so the couple of hundred
 * milliseconds are spent while somebody is typing their email rather than after they
 * press the button. An attestation that adds a visible pause to a purchase is one that
 * gets removed a week later for hurting conversion, and then it protects nothing.
 *
 * ## Never blocks the action
 *
 * Every caller treats a failure as "no attestation": the request goes through unproven
 * and the server's risk scoring notices. A cost defence that can lock a customer out of
 * checkout when it misbehaves is a worse bug than the one it prevents.
 */

let inflight: Promise<string | null> | null = null;
let cached: { token: string; expiresAt: number } | null = null;

async function build(): Promise<string | null> {
  try {
    const response = await fetch('/api/attest', { cache: 'no-store' });
    if (!response.ok) return null;

    const challenge = (await response.json()) as PowChallenge;
    const solution = await solve(challenge);

    const token = btoa(
      JSON.stringify({
        nonce: challenge.nonce,
        difficulty: challenge.difficulty,
        expiresAt: challenge.expiresAt,
        signature: challenge.signature,
        counter: solution.counter,
      })
    )
      // base64url, to match what the server decodes.
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    cached = { token, expiresAt: challenge.expiresAt };
    return token;
  } catch {
    return null;
  } finally {
    inflight = null;
  }
}

/** Start solving now, in the background. Safe to call repeatedly. */
export function prewarm(): void {
  if (cached && cached.expiresAt > Date.now() + 30_000) return;
  if (!inflight) inflight = build();
}

/**
 * The header value, or null.
 *
 * A token is used once — the server burns the nonce — so it is cleared on read. The next
 * call solves a fresh one, which is the point: the cost is per attempt.
 */
export async function attestationHeader(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) {
    const token = cached.token;
    cached = null;
    prewarm();
    return token;
  }

  const token = await (inflight ?? (inflight = build()));
  cached = null;
  prewarm();
  return token;
}

/** Adds the header when there is one, and quietly does nothing when there is not. */
export async function withAttestation(headers: HeadersInit = {}): Promise<Headers> {
  const merged = new Headers(headers);
  const token = await attestationHeader();
  if (token) merged.set('x-tr-attestation', token);
  return merged;
}
