'use client';

import { auth, isFirebaseConfigured } from '@/shared/firebase/client';

/**
 * `fetch` with the signed-in user's Firebase ID token attached.
 *
 * Privileged API routes verify the token server-side (`backend/auth/require-admin.ts`)
 * rather than trusting anything the browser says about itself. This is the other half
 * of that: without it every admin call is a 401, and with a hand-rolled version per
 * component one of them eventually forgets to refresh an expired token.
 *
 * `getIdToken()` returns the cached token and refreshes it automatically when it is
 * close to expiry, so a console left open for hours keeps working.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (isFirebaseConfigured) {
    /*
     * Wait for the session to finish restoring before deciding there is no user.
     *
     * `auth.currentUser` is null for the first moments after a page loads (and after a
     * phone brings a backgrounded tab back), while Firebase rehydrates the session from
     * storage. Checking it directly in that window sent requests with no Authorization
     * header at all — which a door scanner surfaced as "Invalid ticket: Missing bearer
     * token" for a steward who was signed in the whole time. `authStateReady()` resolves
     * as soon as the restore settles, in practice milliseconds; a genuinely signed-out
     * user still produces a bare request and the server's honest 401.
     */
    await auth.authStateReady();
    if (auth.currentUser) {
      headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
    }
  }

  return fetch(input, { ...init, headers });
}
