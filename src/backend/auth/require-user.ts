import 'server-only';

import { getAuth } from 'firebase-admin/auth';

import { getAdminApp, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * Server-side proof of *who* is calling, with no claim about what they are allowed to do.
 *
 * `requireAdmin` is built on this and adds the `userType` lookup. Keeping the token half
 * in one place matters more than the few lines it saves: a route that verifies identity
 * slightly differently from the others is exactly where an auth bug hides.
 */

export type UserCheck =
  | { ok: true; uid: string; email?: string; emailVerified: boolean }
  | { ok: false; status: 401 | 503; error: string };

/** Extracts a bearer token. Returns undefined rather than throwing on a malformed header. */
export function bearer(request: Request): string | undefined {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim() || undefined;
}

export async function requireUser(request: Request): Promise<UserCheck> {
  if (!isAdminConfigured()) {
    // Fail closed. Without the Admin SDK there is no way to verify anything, and
    // treating "cannot check" as "allowed" is how a privileged route becomes public.
    return { ok: false, status: 503, error: 'Server auth is not configured.' };
  }

  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: 'Missing bearer token.' };

  try {
    // checkRevoked: a signed-out or disabled account must stop working immediately, not
    // when its hour-long token happens to expire.
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
    return {
      ok: true,
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    // The reason stays server-side: distinguishing "expired" from "forged" for the
    // caller is free reconnaissance.
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }
}
