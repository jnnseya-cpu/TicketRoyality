import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { checkLogin, recordFailure } from '@/backend/security/login-guard';

/**
 * Access codes for hidden ticket types.
 *
 * ## Why the code is not on the event
 *
 * Published events are readable by anyone — that is what a public catalogue is. Anything
 * stored on the event document is therefore public, including a hash: an access code is
 * short and memorable by design ("BOARD2026"), so a hash sitting in a document a stranger
 * can read is a dictionary attack waiting to be run offline, at no cost and with no
 * throttle in the way.
 *
 * So codes live in `event_access_codes`, which denies every client read and write, and
 * verification happens here. An attacker has to ask the server, and the server counts.
 *
 * ## What this hides, stated plainly
 *
 * The tier itself stays in `ticketTiers` on the event, because inventory, holds and
 * issuance all read that array and a hidden tier that lived elsewhere would be a second
 * inventory model. It carries `visibility: 'hidden'`, which the UI honours.
 *
 * That means somebody reading the raw document can see that a hidden tier exists, and its
 * price. What they cannot do is buy it: checkout refuses a hidden tier without the code,
 * server-side. The code gates the purchase, not the knowledge that the tier is there, and
 * anywhere this is described it should say exactly that.
 */

const COLLECTION = 'event_access_codes';

interface CodeDoc {
  /** tierId → HMAC of the code. */
  codes: Record<string, string>;
  updatedAt: string;
}

/** Normalised so "board 2026", "BOARD2026" and " Board2026 " are the same code. */
function normalise(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

function hash(eventId: string, tierId: string, code: string): string {
  const secret = process.env.CRON_SECRET ?? 'ticketroyality-access-codes';
  // Scoped to the event and tier, so one leaked hash cannot be replayed against another
  // organiser's tier that happens to use the same word.
  return createHmac('sha256', secret)
    .update(`${eventId}|${tierId}|${normalise(code)}`)
    .digest('base64url');
}

function matches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Store the codes for an event, replacing what was there.
 *
 * A tier whose code is an empty string is removed rather than set to a blank code that
 * would let anybody through by pressing enter.
 */
export async function setAccessCodes(
  eventId: string,
  codes: Record<string, string>
): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const hashed: Record<string, string> = {};
    for (const [tierId, code] of Object.entries(codes)) {
      if (!code?.trim()) continue;
      hashed[tierId] = hash(eventId, tierId, code);
    }

    await getAdminDb()
      .collection(COLLECTION)
      .doc(eventId)
      .set({ codes: hashed, updatedAt: new Date().toISOString() } satisfies CodeDoc);
    return true;
  } catch (error) {
    reportError(error, { scope: 'access-codes.set', eventId });
    return false;
  }
}

/** Which tiers an organiser has set a code on — never the codes themselves. */
export async function tiersWithCodes(eventId: string): Promise<string[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(eventId).get();
    return Object.keys((snap.data() as CodeDoc | undefined)?.codes ?? {});
  } catch (error) {
    reportError(error, { scope: 'access-codes.list', eventId });
    return [];
  }
}

export type UnlockResult =
  | { ok: true; tierIds: string[] }
  | { ok: false; status: 401 | 429 | 503; error: string; retryAfter?: number };

/**
 * Check a code, returning every tier it opens.
 *
 * One code may open several tiers — a partner given "PARTNER26" for both the discounted
 * seat and the discounted table should type it once.
 *
 * Throttled in its own namespace: twenty wrong codes must not lock the office out of
 * logging in, which is what sharing login's counters would do.
 */
export async function unlock(
  eventId: string,
  code: string,
  ip: string
): Promise<UnlockResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, error: 'Access codes are unavailable.' };
  }
  if (!code?.trim()) return { ok: false, status: 401, error: 'Enter the code.' };

  const guard = await checkLogin(`event:${eventId}`, ip, 'access-code');
  if (!guard.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'Too many attempts. Try again shortly.',
      retryAfter: guard.retryAfter,
    };
  }

  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(eventId).get();
    const stored = (snap.data() as CodeDoc | undefined)?.codes ?? {};

    const tierIds = Object.entries(stored)
      .filter(([tierId, expected]) => matches(expected, hash(eventId, tierId, code)))
      .map(([tierId]) => tierId);

    if (tierIds.length === 0) {
      await recordFailure(`event:${eventId}`, ip, 'access-code');
      // Deliberately the same message whether the event has codes or not: telling a
      // stranger "this event has no hidden tiers" is free reconnaissance.
      return { ok: false, status: 401, error: 'That code is not recognised.' };
    }

    return { ok: true, tierIds };
  } catch (error) {
    reportError(error, { scope: 'access-codes.unlock', eventId });
    return { ok: false, status: 503, error: 'Could not check that code.' };
  }
}

/**
 * The checkout question: may this code buy this tier?
 *
 * Unthrottled on purpose — it runs after a buyer has already unlocked the tier and is
 * paying, and a shopper who takes fifteen minutes over a card form must not be refused
 * because the unlock counter has moved on.
 */
export async function codeOpensTier(
  eventId: string,
  tierId: string,
  code: string
): Promise<boolean> {
  if (!isAdminConfigured() || !code?.trim()) return false;
  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(eventId).get();
    const expected = (snap.data() as CodeDoc | undefined)?.codes?.[tierId];
    if (!expected) return false;
    return matches(expected, hash(eventId, tierId, code));
  } catch (error) {
    reportError(error, { scope: 'access-codes.check', eventId, tierId });
    return false;
  }
}
