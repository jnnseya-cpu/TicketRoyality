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

  if (isFirebaseConfigured && auth.currentUser) {
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }

  return fetch(input, { ...init, headers });
}
