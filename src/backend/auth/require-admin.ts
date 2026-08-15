import 'server-only';

import { getAuth } from 'firebase-admin/auth';

import { getAdminApp, getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * Server-side proof that the caller is a platform administrator.
 *
 * Two checks, and both are necessary. The ID token proves *who* is calling — it is
 * signed by Google and cannot be forged by the browser that presents it. The Firestore
 * lookup proves *what they are*, because `userType` lives on the user document, not in
 * the token, and it is the same field `firestore.rules` treats as authoritative. A
 * custom claim would be faster and is deliberately not used: it would create a second
 * source of truth for admin status that can drift from the first.
 *
 * The cost is one document read per privileged API call, which is the right trade for
 * routes that send email and read the delivery log.
 */

export type AdminCheck =
  | { ok: true; uid: string; email?: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

/** Extracts a bearer token. Returns undefined rather than throwing on a malformed header. */
function bearer(request: Request): string | undefined {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim() || undefined;
}

export async function requireAdmin(request: Request): Promise<AdminCheck> {
  if (!isAdminConfigured()) {
    // Fail closed. Without the Admin SDK there is no way to verify anything, and
    // treating "cannot check" as "allowed" is how a privileged route becomes public.
    return { ok: false, status: 503, error: 'Server auth is not configured.' };
  }

  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: 'Missing bearer token.' };

  let uid: string;
  let email: string | undefined;
  try {
    // checkRevoked: a signed-out or disabled administrator must stop working
    // immediately, not when their hour-long token happens to expire.
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    // The reason stays server-side: distinguishing "expired" from "forged" for the
    // caller is free reconnaissance.
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }

  try {
    const doc = await getAdminDb().collection('users').doc(uid).get();
    if (!doc.exists || doc.data()?.userType !== 'superuser') {
      return { ok: false, status: 403, error: 'Administrator access required.' };
    }
  } catch {
    return { ok: false, status: 503, error: 'Could not verify administrator access.' };
  }

  return { ok: true, uid, email };
}
