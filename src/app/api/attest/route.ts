import { NextResponse } from 'next/server';

import { issueChallenge } from '@/backend/security/attestation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hands out a proof-of-work challenge.
 *
 * Open by design — a challenge is worth nothing on its own, and gating the thing that
 * proves you are human behind proof that you are human is a circle. What it costs an
 * attacker is the work; what it costs us is one HMAC.
 *
 * Never cached. A challenge served twice from an edge is a challenge whose single-use
 * nonce is already spent for the second person to receive it.
 */
export async function GET() {
  return NextResponse.json(issueChallenge(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
