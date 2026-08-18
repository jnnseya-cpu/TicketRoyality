import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import {
  POW_DIFFICULTY,
  POW_TTL_MS,
  meetsDifficulty,
  type PowChallenge,
} from '@/shared/security/pow';

/**
 * Issuing and checking proof-of-work attestations.
 *
 * Three things have to be true for this to be worth anything, and each one is a way it
 * is usually got wrong:
 *
 * 1. **The challenge must be ours.** A client that can invent its own nonce picks a
 *    difficulty of zero. So every challenge is signed, and an unsigned or edited one is
 *    refused before a single hash is checked.
 *
 * 2. **A solution must be single-use.** Otherwise one solved challenge is a reusable
 *    token and the cost is paid once for unlimited attempts — which is the whole
 *    property, gone. Redemption is a `create` on a document keyed by the nonce, so the
 *    database refuses the replay rather than a flag in memory that empties on deploy.
 *
 * 3. **It must fail open.** This is not authentication and it is not authorisation; it
 *    is a cost. If Firestore is unreachable, refusing every sign-up and every checkout to
 *    protect against bots would be doing the attacker's work for them. The request
 *    proceeds unattested, the risk score notices, and the outage is reported.
 */

const COLLECTION = 'attestations';

function secret(): string {
  // CRON_SECRET is already a server-only high-entropy value present in every environment
  // that has any of the rest of this working. A second secret to configure is a second
  // thing to forget.
  return process.env.CRON_SECRET ?? 'ticketroyality-attestation';
}

function sign(nonce: string, difficulty: number, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`${nonce}|${difficulty}|${expiresAt}`)
    .digest('base64url');
}

function signaturesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** A fresh challenge. Costs nothing to issue and cannot be pre-computed usefully. */
export function issueChallenge(difficulty = POW_DIFFICULTY): PowChallenge {
  const nonce = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + POW_TTL_MS;
  return { nonce, difficulty, expiresAt, signature: sign(nonce, difficulty, expiresAt) };
}

export type AttestResult =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'forged' | 'expired' | 'insufficient' | 'replayed' };

/**
 * Verify a solved challenge, and burn it.
 *
 * The order matters: the signature is checked before the hash, so a forged challenge
 * costs us one HMAC rather than a proof-of-work verification, and the nonce is burned
 * before the work is checked so a valid nonce cannot be hammered with guesses.
 */
export async function verifyAttestation(header: string | null): Promise<AttestResult> {
  if (!header) return { ok: false, reason: 'malformed' };

  let parsed: { nonce?: string; difficulty?: number; expiresAt?: number; signature?: string; counter?: number };
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const { nonce, difficulty, expiresAt, signature, counter } = parsed;
  if (
    typeof nonce !== 'string' ||
    typeof difficulty !== 'number' ||
    typeof expiresAt !== 'number' ||
    typeof signature !== 'string' ||
    typeof counter !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (!signaturesMatch(sign(nonce, difficulty, expiresAt), signature)) {
    return { ok: false, reason: 'forged' };
  }
  if (expiresAt < Date.now()) return { ok: false, reason: 'expired' };

  // Burned first. A nonce that is only marked used *after* the work checks out can be
  // brute-forced in parallel by a client that keeps guessing counters.
  if (isAdminConfigured()) {
    try {
      await getAdminDb()
        .collection(COLLECTION)
        .doc(nonce)
        .create({ usedAt: new Date().toISOString(), difficulty });
    } catch (error) {
      // ALREADY_EXISTS: this challenge has been spent.
      if ((error as { code?: number }).code === 6) return { ok: false, reason: 'replayed' };
      reportError(error, { scope: 'attestation.burn' });
      // Fails open — see the header comment. A datastore outage must not close the doors.
    }
  }

  return meetsDifficulty(nonce, counter, difficulty)
    ? { ok: true }
    : { ok: false, reason: 'insufficient' };
}

/**
 * The signal `assessRisk` consumes.
 *
 * `undefined` rather than `false` when no attestation was sent at all: an old browser
 * tab or a client we have not instrumented is unproven, not hostile, and scoring it as a
 * failure would punish the customer who left a checkout open over lunch.
 */
export async function attestationSignal(request: Request): Promise<boolean | undefined> {
  const header = request.headers.get('x-tr-attestation');
  if (!header) return undefined;

  const result = await verifyAttestation(header);
  if (result.ok) return true;

  /*
   * An expired challenge is **unproven, not hostile**.
   *
   * It means the person took longer than ten minutes between the form appearing and
   * pressing the button — which on a three-step organiser application is what a careful
   * human does, not what a script does. Scoring slowness as evidence of automation is
   * backwards, and it stacks with other weak signals until a real applicant is refused.
   *
   * Everything else — forged, insufficient work, a replayed nonce — stays a failure,
   * because each of those is somebody constructing a token rather than solving one.
   */
  if (result.reason === 'expired') return undefined;

  return false;
}

/** Housekeeping: spent nonces are worthless once they cannot be replayed anyway. */
export async function purgeSpentAttestations(limit = 500): Promise<number> {
  if (!isAdminConfigured()) return 0;
  try {
    const stale = await getAdminDb()
      .collection(COLLECTION)
      .where('usedAt', '<', new Date(Date.now() - POW_TTL_MS * 2).toISOString())
      .limit(limit)
      .get();

    await Promise.all(stale.docs.map((doc) => doc.ref.delete()));
    return stale.size;
  } catch (error) {
    reportError(error, { scope: 'attestation.purge' });
    return 0;
  }
}
