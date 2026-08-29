import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import {
  getConnectedAccountStatus,
  isConnectConfigured,
  transferToConnected,
} from '@/backend/payments/stripe-connect';
import type { Payout, UserProfile } from '@/shared/types';

/**
 * Settlement — paying the owed money out, idempotently.
 *
 * The platform already records what every party is owed: a promoter's commission on
 * `partner_links`, a box-office service fee on `box_office_sales`, an organiser's face
 * value in their tickets. Recording it was always the easy half. This is the other half —
 * actually moving it — done the one way money must always move here: **idempotently**.
 *
 * Every payout is keyed. The key IS the `payouts/{key}` document id, so a repeated
 * settlement (a retry, a double click, a re-run of a scheduler) finds the record already
 * there and pays nothing again. That is the same guard issuance uses on the way in, and it
 * is the only thing standing between "the scheduler ran twice" and "the promoter was paid
 * twice".
 *
 * When Connect is off, or a party has not finished onboarding, a payout is not an error and
 * not a silent no-op: it is **recorded as `blocked`**, so the money stays owed, visibly, and
 * settles the moment the account is ready. Nothing here ever reports success it did not have.
 */

const PAYOUTS = 'payouts';

/**
 * A stable idempotency key for one payout. Pure, so the caller and a retry derive the same
 * string. `periodKey` scopes it — an event id, a sale id, a month — so the *same* debt is
 * paid once while a *new* period is a new, payable key.
 */
export function payoutKey(party: string, partyId: string, reason: string, periodKey: string): string {
  return `${party}_${partyId}_${reason}_${periodKey}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 300);
}

export interface SettleInput {
  key: string;
  party: 'organiser' | 'promoter';
  partyId: string;
  connectedAccountId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  metadata?: Record<string, string>;
}

export type SettleResult =
  | { ok: true; status: 'paid'; transferId: string }
  | { ok: true; status: 'already-settled' }
  | { ok: false; status: 'blocked' | 'failed'; error: string };

/**
 * Settle one debt to one party. Records the intent FIRST (claiming the idempotency key),
 * then moves the money, then records the outcome — so a crash after the transfer cannot
 * lose the fact that it happened, and a retry sees the claimed key and refuses to double-pay.
 */
export async function settle(input: SettleInput): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, status: 'failed', error: 'Settlement is unavailable.' };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, status: 'failed', error: 'A payout must be a positive whole amount.' };
  }

  const db = getAdminDb();
  const ref = db.collection(PAYOUTS).doc(input.key);

  // Claim the key. A create that fails with ALREADY_EXISTS (code 6) means this debt was
  // already settled (or is being settled) — the whole point of the guard.
  const base: Omit<Payout, 'status' | 'transferId' | 'error'> = {
    id: input.key,
    party: input.party,
    partyId: input.partyId,
    connectedAccountId: input.connectedAccountId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
  try {
    await ref.create({ ...base, status: 'blocked' });
  } catch (error) {
    if ((error as { code?: number }).code === 6) return { ok: true, status: 'already-settled' };
    reportError(error, { scope: 'settlement.claim', key: input.key });
    return { ok: false, status: 'failed', error: 'Could not start the payout.' };
  }

  // Connect off, or nothing to pay to: leave it recorded as blocked. The debt stays owed
  // and visible; re-running once Connect is live settles it under a fresh key by the caller.
  if (!isConnectConfigured()) {
    return { ok: false, status: 'blocked', error: 'Payouts are not enabled yet.' };
  }

  const status = await getConnectedAccountStatus(input.connectedAccountId);
  if (!status.ok || !status.status.payoutsEnabled) {
    await ref.update({ error: status.ok ? 'Account cannot receive payouts yet.' : status.error });
    return { ok: false, status: 'blocked', error: 'That account cannot receive payouts yet.' };
  }

  const transfer = await transferToConnected({
    accountId: input.connectedAccountId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    idempotencyKey: input.key,
    metadata: { party: input.party, partyId: input.partyId, reason: input.reason, ...input.metadata },
  });

  if (!transfer.ok) {
    await ref.update({ status: 'failed', error: transfer.error });
    return { ok: false, status: 'failed', error: transfer.error };
  }

  await ref.update({ status: 'paid', transferId: transfer.transferId });
  return { ok: true, status: 'paid', transferId: transfer.transferId };
}

/**
 * Settle a debt to an organiser, resolving their connected account from their profile. A
 * thin wrapper so callers name the organiser, not their Stripe id.
 */
export async function settleOrganiser(input: {
  organiserId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  periodKey: string;
  metadata?: Record<string, string>;
}): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, status: 'failed', error: 'Settlement is unavailable.' };

  const snap = await getAdminDb().collection('users').doc(input.organiserId).get();
  const profile = snap.data() as Pick<UserProfile, 'stripeConnectId'> | undefined;
  if (!profile?.stripeConnectId) {
    return { ok: false, status: 'blocked', error: 'This organiser has not connected a payout account.' };
  }

  return settle({
    key: payoutKey('organiser', input.organiserId, input.reason, input.periodKey),
    party: 'organiser',
    partyId: input.organiserId,
    connectedAccountId: profile.stripeConnectId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    metadata: input.metadata,
  });
}

/** A party's payout history, newest first. */
export async function listPayouts(partyId: string): Promise<Payout[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb().collection(PAYOUTS).where('partyId', '==', partyId).limit(200).get();
    return snap.docs
      .map((d) => d.data() as Payout)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    reportError(error, { scope: 'settlement.list', partyId });
    return [];
  }
}
