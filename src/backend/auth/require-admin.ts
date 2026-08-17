import 'server-only';

import { getAdminDb } from '@/backend/firebase/admin';
import { requireUser } from '@/backend/auth/require-user';

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

export async function requireAdmin(request: Request): Promise<AdminCheck> {
  // Identity first, and from the same helper every other authenticated route uses.
  const caller = await requireUser(request);
  if (!caller.ok) return caller;
  const { uid, email } = caller;

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
