import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * API keys for the public API.
 *
 * ## The key itself is never stored
 *
 * Only an HMAC of it is. A leaked database of plaintext API keys is a leaked database of
 * everybody's ticket data, and it is a leak the owners could not detect — the key keeps
 * working. So the secret is shown once, at creation, and after that even we cannot recover
 * it; a lost key is replaced, never looked up.
 *
 * ## Live and test are different keys, not a flag
 *
 * `tr_test_…` reads fixtures and touches nothing real. That is not a courtesy to
 * integrators — it is what stops the first integration attempt from redeeming live
 * tickets against a real door. Making it a *different key* rather than a header means a
 * request cannot flip to live by omitting something.
 */

const KEYS = 'api_keys';

/** Long enough that guessing is not a strategy; the prefix says which world it is in. */
function generateSecret(mode: 'live' | 'test'): string {
  return `tr_${mode}_${randomBytes(24).toString('base64url')}`;
}

function signingKey(): string {
  /*
   * Falls back to the QR signing key rather than inventing a second secret to configure.
   * If neither is set the module refuses to issue keys at all, which is the honest
   * failure: an API key hashed with a constant is not hashed.
   */
  return process.env.API_KEY_SECRET ?? process.env.QR_SIGNING_KEY ?? '';
}

export function hashKey(secret: string): string {
  return createHmac('sha256', signingKey()).update(secret).digest('hex');
}

export type Scope = 'events:read' | 'tickets:read' | 'attendees:read' | 'webhooks:manage';

export const ALL_SCOPES: Scope[] = [
  'events:read',
  'tickets:read',
  'attendees:read',
  'webhooks:manage',
];

export interface ApiKeyRecord {
  id: string;
  organizerId: string;
  name: string;
  mode: 'live' | 'test';
  scopes: Scope[];
  /** First characters of the secret, so a key can be identified in a list without it. */
  hint: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export type CreateKeyResult =
  | { ok: true; secret: string; id: string }
  | { ok: false; reason: 'unconfigured' | 'unavailable'; error: string };

export async function createKey(input: {
  organizerId: string;
  name: string;
  mode: 'live' | 'test';
  scopes: Scope[];
}): Promise<CreateKeyResult> {
  if (!signingKey()) {
    // Refused rather than hashed with an empty string, which would make every key's hash
    // predictable from the key — which is the same as storing them in plaintext.
    return {
      ok: false,
      reason: 'unconfigured',
      error: 'API keys are not configured on this deployment.',
    };
  }
  if (!isAdminConfigured()) {
    return { ok: false, reason: 'unavailable', error: 'Unavailable right now.' };
  }

  const secret = generateSecret(input.mode);

  try {
    const ref = await getAdminDb()
      .collection(KEYS)
      .add({
        organizerId: input.organizerId,
        name: input.name.slice(0, 80) || 'API key',
        mode: input.mode,
        scopes: input.scopes.filter((s) => ALL_SCOPES.includes(s)),
        hash: hashKey(secret),
        // Enough to recognise which key this is in a list, not enough to use it.
        hint: `${secret.slice(0, 12)}…${secret.slice(-4)}`,
        createdAt: new Date().toISOString(),
      });

    // The only time the secret exists outside the caller's browser.
    return { ok: true, secret, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'apiKeys.create', organizerId: input.organizerId });
    return { ok: false, reason: 'unavailable', error: 'Could not create that key.' };
  }
}

export interface Caller {
  organizerId: string;
  mode: 'live' | 'test';
  scopes: Scope[];
  keyId: string;
}

/**
 * Who is calling, from the `Authorization: Bearer` header.
 *
 * The lookup is by hash, so a stolen database still cannot be used to call the API as
 * anybody. The comparison is constant-time even though the value compared is already a
 * hash — the habit is what survives the next refactor.
 */
export async function authenticate(request: Request): Promise<Caller | null> {
  const header = request.headers.get('authorization') ?? '';
  const secret = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!secret || !signingKey() || !isAdminConfigured()) return null;

  try {
    const hash = hashKey(secret);
    const snap = await getAdminDb().collection(KEYS).where('hash', '==', hash).limit(1).get();
    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = doc.data() as ApiKeyRecord & { hash: string };
    if (data.revokedAt) return null;

    const a = Buffer.from(data.hash);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    /*
     * Last used is written without awaiting and without failing the request. It is an
     * operational nicety — "this key has not been used since March" — and an API call
     * must not fail because a timestamp could not be recorded.
     */
    void doc.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => undefined);

    return {
      organizerId: data.organizerId,
      mode: data.mode,
      scopes: data.scopes ?? [],
      keyId: doc.id,
    };
  } catch (error) {
    reportError(error, { scope: 'apiKeys.auth' });
    return null;
  }
}

export async function listKeys(organizerId: string): Promise<ApiKeyRecord[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb().collection(KEYS).where('organizerId', '==', organizerId).get();
    return snap.docs
      .map((d) => {
        // The hash never leaves this module, even to our own dashboard. `id` is dropped
        // with it and re-set from the document, so a stored `id` field cannot shadow the
        // real one.
        const { hash: _hash, id: _id, ...rest } = d.data() as ApiKeyRecord & { hash: string };
        return { ...rest, id: d.id } as ApiKeyRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    reportError(error, { scope: 'apiKeys.list', organizerId });
    return [];
  }
}

/**
 * Revoke a key.
 *
 * Stamped rather than deleted: "which key was this and when did we turn it off" is the
 * first question after an incident, and a deleted row cannot answer it.
 */
export async function revokeKey(id: string, organizerId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const ref = getAdminDb().collection(KEYS).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.organizerId !== organizerId) return false;

    await ref.update({ revokedAt: new Date().toISOString() });
    return true;
  } catch (error) {
    reportError(error, { scope: 'apiKeys.revoke', id });
    return false;
  }
}
