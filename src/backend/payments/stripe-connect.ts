import 'server-only';

import Stripe from 'stripe';

/**
 * Stripe Connect — paying money OUT to the people who are owed it.
 *
 * Everything else in `stripe.ts` takes money IN. This module is the other direction:
 * an organiser, a promoter or a white-label seller is owed a settlement, and a Connect
 * transfer is how it reaches their own bank without the platform ever touching the cash
 * as its own — the same Stripe vendor, a capability the account already has, not a sixth
 * account.
 *
 * ## Gated OFF until the owner turns it on
 *
 * Connect creates real bank-connected accounts and moves real money, so it must never
 * switch on by the mere presence of a Stripe key. It is enabled only when
 * `STRIPE_CONNECT_ENABLED === 'true'` AND a secret key exists. Until then every function
 * here refuses with a clear error rather than doing anything — no account is created, no
 * transfer is attempted, and the settlement service records the attempt as `blocked`
 * instead of pretending money moved.
 *
 * Activation is an owner action, not a code change: enable Connect in the Stripe
 * dashboard, then set the env var. The code is complete and waits behind the flag.
 */

export function isConnectConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && process.env.STRIPE_CONNECT_ENABLED === 'true';
}

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  if (process.env.STRIPE_CONNECT_ENABLED !== 'true') {
    throw new Error('Stripe Connect is not enabled (set STRIPE_CONNECT_ENABLED=true).');
  }
  return new Stripe(key);
}

export interface ConnectedAccountStatus {
  id: string;
  /** Ready to receive transfers — this is what settlement checks before paying out. */
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  /** Whether the party finished Stripe's onboarding form. */
  detailsSubmitted: boolean;
}

/**
 * Create an Express connected account for a party (organiser / promoter). Express keeps
 * KYC, bank details and the payout schedule with Stripe rather than on this platform,
 * which is the point — the platform never stores a bank account.
 */
export async function createConnectedAccount(input: {
  email?: string;
  country?: string;
  metadata?: Record<string, string>;
}): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  if (!isConnectConfigured()) return { ok: false, error: 'Payouts are not enabled yet.' };
  try {
    const account = await client().accounts.create({
      type: 'express',
      country: input.country || 'GB',
      ...(input.email ? { email: input.email } : {}),
      capabilities: { transfers: { requested: true } },
      metadata: input.metadata,
    });
    return { ok: true, accountId: account.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not create the account.' };
  }
}

/**
 * A hosted onboarding link the party follows to add their bank details. Single-use and
 * short-lived by Stripe's design, so the caller mints a fresh one each time rather than
 * storing it.
 */
export async function createOnboardingLink(input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isConnectConfigured()) return { ok: false, error: 'Payouts are not enabled yet.' };
  try {
    const link = await client().accountLinks.create({
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding',
    });
    return { ok: true, url: link.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not start onboarding.' };
  }
}

/** Where a connected account stands — read before every payout, never assumed. */
export async function getConnectedAccountStatus(
  accountId: string
): Promise<{ ok: true; status: ConnectedAccountStatus } | { ok: false; error: string }> {
  if (!isConnectConfigured()) return { ok: false, error: 'Payouts are not enabled yet.' };
  try {
    const a = await client().accounts.retrieve(accountId);
    return {
      ok: true,
      status: {
        id: a.id,
        payoutsEnabled: Boolean(a.payouts_enabled),
        chargesEnabled: Boolean(a.charges_enabled),
        detailsSubmitted: Boolean(a.details_submitted),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read the account.' };
  }
}

/**
 * Move `amountMinor` to a connected account. **Idempotent by key** — a repeated
 * settlement (a retry, a double click, a re-run of the scheduler) must never pay the same
 * party twice, so the same `idempotencyKey` returns Stripe's original transfer rather than
 * creating a second one. This is the money-safety rule the whole settlement layer rests on.
 */
export async function transferToConnected(input: {
  accountId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  if (!isConnectConfigured()) return { ok: false, error: 'Payouts are not enabled yet.' };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, error: 'A payout must be a positive whole amount.' };
  }
  try {
    const transfer = await client().transfers.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        destination: input.accountId,
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey }
    );
    return { ok: true, transferId: transfer.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The transfer failed.' };
  }
}
