import 'server-only';

import { createHash } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * Login throttling.
 *
 * Only sign-up was gated. `/login` was unthrottled, so an attacker with a list of
 * breached credentials could try them at whatever rate they liked, and the first anyone
 * would know is a customer reporting a compromised account.
 *
 * ## What this stops, and what it does not
 *
 * It raises the cost of credential stuffing **through our form**, which is where naive
 * automation goes. It does not stop somebody calling Firebase Auth directly — that is
 * what App Check closes, because it enforces at the Firebase service rather than at our
 * own JavaScript, and it needs a reCAPTCHA Enterprise site key from the console.
 *
 * Saying so plainly matters more than the feature: a throttle that is described as
 * "brute-force protection" invites everyone to stop worrying about the direct path.
 *
 * ## Two counters, deliberately
 *
 * Per identifier catches one account being hammered. Per network catches one attacker
 * spraying one password across many accounts, which no per-account counter ever sees —
 * each individual account looks like a single typo.
 *
 * ## The email is never stored
 *
 * Attempt records are keyed by a salted hash. A collection of email addresses that
 * failed to log in is a list of accounts worth attacking, and it would be readable by
 * anyone with database access.
 */

/** Per identifier. Six is generous for a typo and mean for a script. */
const MAX_PER_IDENTIFIER = 6;
/** Per network, across all accounts. */
const MAX_PER_NETWORK = 20;
const WINDOW_MS = 15 * 60 * 1000;

export interface GuardVerdict {
  allowed: boolean;
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfter?: number;
  reason?: 'identifier' | 'network';
}

/**
 * The counters are namespaced so a second thing worth throttling — access-code guessing,
 * say — gets its own budget rather than sharing login's.
 *
 * Sharing would be worse than a duplicate implementation: twenty wrong access codes would
 * lock a whole office network out of logging in, which turns a throttle into a denial of
 * service somebody else can trigger on your behalf.
 */
function key(value: string, namespace = 'login'): string {
  // Salted with the cron secret, which is already a server-only high-entropy value, so
  // the hashes cannot be reversed with a dictionary of common addresses.
  const salt = process.env.CRON_SECRET ?? 'ticketroyality-login-guard';
  return createHash('sha256')
    .update(`${salt}|${namespace}|${value.toLowerCase().trim()}`)
    .digest('hex')
    .slice(0, 32);
}

interface AttemptDoc {
  failures: number;
  firstAt: string;
  lastAt: string;
}

async function bump(
  id: string,
  limit: number,
  now: Date,
  record: boolean
): Promise<{ blocked: boolean; retryAfter: number }> {
  const ref = getAdminDb().collection('login_attempts').doc(id);

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as AttemptDoc) : undefined;

    const windowStart = data ? new Date(data.firstAt).getTime() : 0;
    const fresh = !data || now.getTime() - windowStart > WINDOW_MS;
    const failures = fresh ? 0 : data!.failures;

    if (failures >= limit) {
      const retryAfter = Math.ceil((windowStart + WINDOW_MS - now.getTime()) / 1000);
      return { blocked: true, retryAfter: Math.max(1, retryAfter) };
    }

    if (record) {
      tx.set(ref, {
        failures: failures + 1,
        firstAt: fresh ? now.toISOString() : data!.firstAt,
        lastAt: now.toISOString(),
      } satisfies AttemptDoc);
    }

    return { blocked: false, retryAfter: 0 };
  });
}

/**
 * Check before a sign-in attempt is made.
 *
 * Fails **open** when the datastore is unreachable, and that is the deliberate choice:
 * a throttle that cannot read its own counters would otherwise lock every legitimate
 * customer out of the platform during an unrelated outage. A brief window of
 * unthrottled login is a smaller harm than a total denial of service, and the outage
 * itself is reported.
 */
export async function checkLogin(
  identifier: string,
  ip: string,
  namespace = 'login'
): Promise<GuardVerdict> {
  if (!isAdminConfigured()) return { allowed: true };

  try {
    const now = new Date();
    const byId = await bump(key(identifier, namespace), MAX_PER_IDENTIFIER, now, false);
    if (byId.blocked) return { allowed: false, retryAfter: byId.retryAfter, reason: 'identifier' };

    const byIp = await bump(`ip:${key(ip, namespace)}`, MAX_PER_NETWORK, now, false);
    if (byIp.blocked) return { allowed: false, retryAfter: byIp.retryAfter, reason: 'network' };

    return { allowed: true };
  } catch (error) {
    reportError(error, { scope: 'login-guard.check' });
    return { allowed: true };
  }
}

/** Record a failure. Called only when Firebase Auth actually rejected the credentials. */
export async function recordFailure(
  identifier: string,
  ip: string,
  namespace = 'login'
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    const now = new Date();
    await bump(key(identifier, namespace), MAX_PER_IDENTIFIER, now, true);
    await bump(`ip:${key(ip, namespace)}`, MAX_PER_NETWORK, now, true);
  } catch (error) {
    reportError(error, { scope: 'login-guard.record' });
  }
}

/** Clear the counters on a successful sign-in, so a typo never accumulates toward a lockout. */
export async function clearAttempts(identifier: string, ip: string): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    const db = getAdminDb();
    await Promise.all([
      db.collection('login_attempts').doc(key(identifier)).delete(),
      db.collection('login_attempts').doc(`ip:${key(ip)}`).delete(),
    ]);
  } catch {
    // A stale counter expires on its own within the window.
  }
}

/** Best-effort client address. Cloud Run puts the real one first in `x-forwarded-for`. */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}
