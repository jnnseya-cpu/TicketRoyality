import { sha256Short } from '@/shared/security/sha256';

/**
 * Proof-of-work attestation.
 *
 * ## What this replaces, and what it does not
 *
 * App Check with reCAPTCHA Enterprise proves a request came from *our* app on a genuine
 * device, and it enforces at Firestore rather than at our own JavaScript. That is
 * strictly stronger than anything in this file, and it needs a site key from the console
 * plus a service that bills per assessment above its free tier.
 *
 * This is the free replacement, and it makes a smaller claim: it does not prove who you
 * are and it does not stop a determined attacker. It puts a floor under the cost of an
 * automated attempt where there was none, using nothing but CPU.
 *
 * The exact size of that floor is set out at `POW_DIFFICULTY`, including the part most
 * write-ups leave out — a browser hashes in JavaScript and an attacker hashes in C, so
 * the asymmetry runs the wrong way. The rate limiter is what actually bounds bulk abuse;
 * this raises the floor beneath it.
 *
 * ## Why the maths is here rather than on either side alone
 *
 * The browser solves and the server verifies, and if the two ever disagree about how a
 * challenge is hashed then every real customer is refused. One implementation, imported
 * by both.
 *
 * It hashes with `sha256Short` rather than `crypto.subtle.digest`, and that is not a
 * preference. Measured: **20,700 hashes a second** through Web Crypto against
 * **1,069,000** through the synchronous implementation, because the cost is a promise per
 * attempt rather than the hashing. The first version of this file used Web Crypto and a
 * difficulty of 18, which would have taken thirteen seconds per sign-up.
 */

/**
 * Leading zero **bits** required. 17 is roughly 131,000 expected hashes.
 *
 * Measured at 1.07M hashes a second on the build machine, so around 120ms there and
 * perhaps three to five times that on a mid-range phone — a third of a second typically,
 * a second and a half at the unlucky end, and it is solved in the background while a form
 * is being filled in either way.
 *
 * ## The asymmetry, stated rather than glossed
 *
 * A browser runs this in JavaScript. An attacker runs it in C, or on a GPU, an order of
 * magnitude or two faster. Proof of work therefore does **not** make automated sign-up
 * expensive per attempt in any absolute sense — it makes it cost something, where before
 * it cost nothing, and it does so without a key, a vendor or a bill.
 *
 * What actually bounds bulk abuse here is the rate limiter, which allows six attempts per
 * identifier and twenty per network per fifteen minutes. This raises the floor under it;
 * it is not a substitute for it, and anywhere that suggests otherwise is wrong.
 *
 * Deliberately not higher: doubling it doubles an attacker's cost and doubles the wait
 * for someone on a six-year-old Android, and that person is a customer.
 */
export const POW_DIFFICULTY = 17;

/** A challenge is useless after this. Long enough to fill a form, short enough not to stockpile. */
export const POW_TTL_MS = 10 * 60 * 1000;

/** The nonce plus a counter has to stay inside one 55-byte block. See `sha256Short`. */
export const MAX_NONCE_LENGTH = 24;

export interface PowChallenge {
  nonce: string;
  difficulty: number;
  expiresAt: number;
  /** HMAC over the three fields above. Stops a client inventing its own easy challenge. */
  signature: string;
}

export interface PowSolution {
  nonce: string;
  counter: number;
}



/** Counts leading zero bits, which is what makes difficulty a smooth dial rather than a step of 4. */
export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // Math.clz32 counts across 32 bits; the byte sits in the low 8, so subtract 24.
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

/** The exact string both sides hash. Any disagreement here refuses every genuine customer. */
export function powInput(nonce: string, counter: number): string {
  return `tr-pow:v1:${nonce}:${counter}`;
}

export function meetsDifficulty(nonce: string, counter: number, difficulty: number): boolean {
  return leadingZeroBits(sha256Short(powInput(nonce, counter))) >= difficulty;
}

/**
 * Solve. Runs in the browser, on the main thread.
 *
 * Yields every few thousand attempts so a slow device does not freeze its own tab while
 * proving it is a real one — an attestation that makes the page unresponsive fails the
 * only test that matters, which is that a human is still willing to use it.
 */
export async function solve(
  challenge: Pick<PowChallenge, 'nonce' | 'difficulty'>,
  options: { signal?: AbortSignal; maxAttempts?: number } = {}
): Promise<PowSolution> {
  const max = options.maxAttempts ?? 50_000_000;

  for (let counter = 0; counter < max; counter += 1) {
    if (options.signal?.aborted) throw new Error('Attestation cancelled.');

    if (meetsDifficulty(challenge.nonce, counter, challenge.difficulty)) {
      return { nonce: challenge.nonce, counter };
    }

    /*
     * Yield about every 30ms of work. Rare enough that the yields themselves are not the
     * cost — a `setTimeout(0)` is roughly a millisecond, so yielding every 2,000 hashes
     * would have spent more time waiting than hashing.
     */
    if (counter % 32_768 === 0 && counter > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw new Error('Could not complete the check.');
}
