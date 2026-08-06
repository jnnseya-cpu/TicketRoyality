import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * KODA — mobile money payment verification (docs/20).
 *
 * KODA does not collect or settle. The customer pays the merchant number directly,
 * receives an operator SMS, and pastes the code; KODA matches it against the Sentinel
 * SIM ledger, scores it, checks for replay, and fires a signed webhook. The browser
 * hand-off is a convenience — the webhook is the source of truth.
 *
 * Three key types, and the distinction matters:
 *   sk_  secret      full account scope. Server only, never in a bundle.
 *   pk_  publishable write:intents only. Safe in the page — can start a payment,
 *                    never read data.
 *   rk_  restricted  read-only by default, e.g. a reconciliation key for an accountant.
 */

const BASE_URL = process.env.KODA_BASE_URL ?? 'https://kodajnn.com/v1';

export function isKodaConfigured(): boolean {
  return Boolean(process.env.KODA_SECRET_KEY);
}

export type KodaOperator = 'orange_cd' | 'mpesa_cd' | 'airtel_cd' | 'africell_cd';

export type IntentStatus =
  | 'awaiting'
  | 'verified'
  | 'verified_late'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface CreateIntentInput {
  /** Minor units. Never a float — docs/08 §8.3. */
  amount: number;
  currency: 'CDF' | 'USD';
  operators: KodaOperator[];
  /** Our own reference, echoed back on the webhook. */
  metadata?: Record<string, string>;
  successUrl?: string;
  expiresInSeconds?: number;
}

export interface Intent {
  intent_id: string;
  client_secret: string;
  checkout_url: string;
  status: IntentStatus;
  amount: number;
  currency: string;
  expires_at?: string;
}

export interface Receipt {
  receipt_id: string;
  intent_id: string;
  amount: number;
  currency: string;
  operator: KodaOperator;
  msisdn: string;
  verified_at: string;
  trace?: Record<string, unknown>;
}

export class KodaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'KodaError';
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const key = process.env.KODA_SECRET_KEY;
  if (!key) throw new KodaError('KODA_SECRET_KEY is not set', 500, 'not_configured');

  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.idempotencyKey && { 'Idempotency-Key': init.idempotencyKey }),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  // 429 carries Retry-After. Surfacing it rather than swallowing it lets the caller
  // back off correctly instead of hammering a rate limit it cannot see.
  if (response.status === 429) {
    const retry = response.headers.get('retry-after') ?? 'unknown';
    throw new KodaError(`Rate limited. Retry after ${retry}s`, 429, 'rate_limited');
  }

  // 402 means prepaid ACU is exhausted, after the 72h grace buffer. Distinct from a
  // billing failure — the merchant is not in arrears, they are out of credit.
  if (response.status === 402) {
    throw new KodaError('Prepaid ACU exhausted', 402, 'acu_exhausted');
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new KodaError(
      typeof payload.message === 'string' ? payload.message : `KODA ${response.status}`,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined
    );
  }

  return payload as T;
}

/** Verifies the key and returns the merchant it unlocks. Use it as a health probe. */
export async function ping() {
  return call<{ merchant_id: string; environment: 'test' | 'live' }>('/ping');
}

/**
 * Creates a payment intent and returns a hosted checkout URL.
 *
 * `idempotencyKey` should be our order reference: a retried request must never create
 * a second intent, or the buyer sees two payment panels for one order.
 */
export async function createIntent(
  input: CreateIntentInput,
  idempotencyKey: string
): Promise<Intent> {
  return call<Intent>('/intents', {
    method: 'POST',
    idempotencyKey,
    body: {
      amount: input.amount,
      currency: input.currency,
      operators: input.operators,
      metadata: input.metadata,
      success_url: input.successUrl,
      expires_in: input.expiresInSeconds,
    },
  });
}

export async function getIntent(intentId: string): Promise<Intent> {
  return call<Intent>(`/intents/${encodeURIComponent(intentId)}`);
}

/** Submits the customer's operator SMS code. */
export async function verifyIntent(
  intentId: string,
  reference: string
): Promise<{ status: IntentStatus; receipt_id?: string; reason?: string }> {
  return call(`/intents/${encodeURIComponent(intentId)}/verify`, {
    method: 'POST',
    body: { reference },
  });
}

export async function cancelIntent(intentId: string): Promise<{ status: IntentStatus }> {
  return call(`/intents/${encodeURIComponent(intentId)}/cancel`, { method: 'POST' });
}

export async function listReceipts(params: {
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<{ receipts: Receipt[] }> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  return call<{ receipts: Receipt[] }>(`/receipts${suffix}`);
}

export async function acuBalance(): Promise<{ balance: number }> {
  return call<{ balance: number }>('/billing/balance');
}

/**
 * Verifies the `x-koda-signature` header: HMAC-SHA256 over the **raw** body.
 *
 * The raw string matters. Re-serialising parsed JSON changes key order and whitespace,
 * so the hash will not match and every webhook will be rejected — a failure that looks
 * like KODA being broken and is actually us.
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.KODA_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = signature.trim();

  if (expected.length !== received.length) return false;
  // Constant-time compare: a fast-exit comparison leaks the signature byte by byte.
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/**
 * Sandbox references that drive each outcome deterministically.
 *
 * A sandbox that only produces success teaches integrators to handle the happy path
 * and crash on everything else — and late verification and replay are exactly what
 * they will meet in production.
 */
export const SANDBOX_REFERENCES = {
  verified: 'TEST-OK-25000',
  late: 'TEST-LATE-90',
  replay: 'TEST-REPLAY',
  suffixMismatch: 'TEST-SUFFIX',
} as const;
