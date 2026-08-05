import 'server-only';

import type { LedgerEntry, LedgerType } from '@/shared/types';
import { WELCOME_BONUS_ACU, chargeForProviderCost, usdToAcu } from '@/shared/constants/billing';

/**
 * ACU wallet ledger — append-only, server-write-only.
 *
 * `firestore.rules` denies `create`, `update` and `delete` on `wallet_ledger` to every
 * client including superusers. Credit is minted here or not at all. The balance on the
 * user document is a denormalised cache; this ledger is the truth, and a nightly job
 * asserts they agree.
 *
 * Two invariants hold on every entry:
 *   balanceAfterAcu === balanceBeforeAcu + deltaAcu
 *   balanceAfterAcu >= 0                       (a wallet never goes negative)
 */

export interface PostEntry {
  uid: string;
  type: LedgerType;
  deltaAcu: number;
  /** Required for ADMIN_GRANT and REVERSAL so every discretionary movement is explained. */
  reason?: string;
  amountUsd?: number;
  providerCostUsd?: number;
  markupMultiplier?: number;
  userChargeUsd?: number;
  /** Replays of the same key are a no-op, not a second credit. */
  idempotencyKey: string;
  reference?: Record<string, string>;
}

/** Builds a balanced entry, or throws if it would drive the wallet negative. */
export function buildEntry(
  post: PostEntry,
  balanceBeforeAcu: number
): Omit<LedgerEntry, 'id'> {
  const balanceAfterAcu = balanceBeforeAcu + post.deltaAcu;

  if (balanceAfterAcu < 0) {
    throw new InsufficientCreditError(balanceBeforeAcu, Math.abs(post.deltaAcu));
  }
  if ((post.type === 'ADMIN_GRANT' || post.type === 'REVERSAL') && !post.reason) {
    throw new Error(`${post.type} requires a reason — discretionary movements must be explained.`);
  }

  return {
    uid: post.uid,
    type: post.type,
    deltaAcu: post.deltaAcu,
    balanceBeforeAcu,
    balanceAfterAcu,
    amountUsd: post.amountUsd,
    providerCostUsd: post.providerCostUsd,
    markupMultiplier: post.markupMultiplier,
    userChargeUsd: post.userChargeUsd,
    reason: post.reason,
    createdAt: new Date().toISOString(),
  };
}

export class InsufficientCreditError extends Error {
  constructor(
    readonly balanceAcu: number,
    readonly requiredAcu: number
  ) {
    super(
      `Insufficient AI credit: balance ${balanceAcu} ACU, need ${requiredAcu} ACU. ` +
        'Top up to continue.'
    );
    this.name = 'InsufficientCreditError';
  }
}

/* -------------------------------------------------------------------------- */
/* Entry builders — one per movement type, so callers cannot mis-shape a post  */
/* -------------------------------------------------------------------------- */

export function welcomeBonus(uid: string): PostEntry {
  return {
    uid,
    type: 'WELCOME_BONUS',
    deltaAcu: WELCOME_BONUS_ACU,
    amountUsd: WELCOME_BONUS_ACU / 100,
    // One bonus per account, ever — the uid alone is the idempotency key.
    idempotencyKey: `WELCOME_BONUS:${uid}`,
  };
}

export function stripeTopup(uid: string, amountUsd: number, sessionId: string): PostEntry {
  return {
    uid,
    type: 'TOPUP_STRIPE',
    deltaAcu: usdToAcu(amountUsd),
    amountUsd,
    idempotencyKey: `TOPUP:${sessionId}`,
    reference: { stripeSessionId: sessionId },
  };
}

export function adminGrant(
  uid: string,
  amountUsd: number,
  adminUid: string,
  reason: string
): PostEntry {
  return {
    uid,
    type: 'ADMIN_GRANT',
    deltaAcu: usdToAcu(amountUsd),
    amountUsd,
    reason,
    idempotencyKey: `GRANT:${adminUid}:${uid}:${Date.now()}`,
    reference: { adminUid },
  };
}

/** Debits a completed AI call at provider cost x markup. */
export function aiSpend(uid: string, providerCostUsd: number, agentRunId: string): PostEntry {
  const charge = chargeForProviderCost(providerCostUsd);
  return {
    uid,
    type: 'AI_SPEND',
    deltaAcu: -charge.acu,
    providerCostUsd: charge.providerCostUsd,
    markupMultiplier: charge.markupMultiplier,
    userChargeUsd: charge.userChargeUsd,
    idempotencyKey: `SPEND:${agentRunId}`,
    reference: { agentRunId },
  };
}

/** Refunds a debit when the provider call failed after ACU was already taken. */
export function reversal(uid: string, acu: number, agentRunId: string, reason: string): PostEntry {
  return {
    uid,
    type: 'REVERSAL',
    deltaAcu: Math.abs(acu),
    reason,
    idempotencyKey: `REVERSAL:${agentRunId}`,
    reference: { agentRunId },
  };
}

/**
 * Posts an entry and updates the denormalised balance in one transaction.
 *
 * NOT YET WIRED. Requires `firebase-admin`:
 *   1. Look up the idempotency key — if present, return the existing entry unchanged.
 *   2. In a transaction: read `users/{uid}.wallet.balanceAcu`, call `buildEntry`,
 *      write `wallet_ledger/{id}`, update the wallet cache and lifetime totals.
 *   3. On `InsufficientCreditError`, do not write — surface it so the caller can offer
 *      a top-up. AI features stop at zero rather than running up a debt.
 *
 * Tracked as debt D2 in docs/13-roadmap-and-production-readiness.md.
 */
export async function post(_entry: PostEntry): Promise<LedgerEntry> {
  throw new Error(
    'ACU ledger writes require the Firebase Admin SDK. See docs/13 debt item D2.'
  );
}
