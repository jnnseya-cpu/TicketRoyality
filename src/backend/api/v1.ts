import 'server-only';

import { NextResponse } from 'next/server';

import { authenticate, type Caller, type Scope } from '@/backend/services/api-keys';

/**
 * The shared parts of the public API: who is calling, what they may do, and the shape of
 * an answer.
 *
 * ## One error shape, always
 *
 * `{ error: { type, message } }`, with the HTTP status carrying the same meaning every
 * time. An API whose failures are shaped differently in different places forces every
 * integrator to write a parser per endpoint, and they get it wrong in the one place that
 * matters — the failure they never saw in testing.
 */

export interface ApiError {
  error: { type: string; message: string };
}

export function apiError(
  status: number,
  type: string,
  message: string
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { type, message } },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export type Authorised =
  | { ok: true; caller: Caller }
  | { ok: false; response: NextResponse<ApiError> };

/**
 * Authenticate and check a scope in one step.
 *
 * A missing key and a wrong key both answer `401 unauthorized` with the same wording:
 * telling a caller their key was recognised but revoked is a small oracle, and nobody
 * legitimately needs it — the dashboard shows them their own keys.
 */
export async function authorise(request: Request, scope: Scope): Promise<Authorised> {
  const caller = await authenticate(request);

  if (!caller) {
    return {
      ok: false,
      response: apiError(
        401,
        'unauthorized',
        'Provide a valid API key as `Authorization: Bearer tr_live_… or tr_test_…`.'
      ),
    };
  }

  if (!caller.scopes.includes(scope)) {
    return {
      ok: false,
      response: apiError(403, 'insufficient_scope', `This key does not have the ${scope} scope.`),
    };
  }

  return { ok: true, caller };
}

/** A list response, with the mode stated so nobody debugs live data thinking it is test. */
export function apiList<T>(caller: Caller, data: T[], extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { object: 'list', mode: caller.mode, data, ...extra },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
