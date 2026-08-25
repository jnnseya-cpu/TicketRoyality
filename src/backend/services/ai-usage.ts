import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { chargeForProviderCost } from '@/backend/billing/margin';

/**
 * Per-user AI usage: a daily call cap and a running spend record.
 *
 * ## Why this exists
 *
 * `/api/ai` fronts three paid model providers (Anthropic, Google, OpenAI). The route
 * used to take a task and an input, run the fallback chain, and return the answer — with
 * no proof of who was calling and no ceiling on how often. That made it an open,
 * unmetered proxy to paid inference: anyone with `curl` could spend the platform's
 * provider budget without limit, and the `similar-events` block on every event page fired
 * one call per anonymous visitor automatically, so ordinary traffic — the exact traffic a
 * launch campaign buys — was an uncapped bill.
 *
 * The proper meter is the ACU wallet (`acu-ledger.ts`), which debits real credit per
 * call. That wallet is not yet wired (docs/13 debt D2), and wiring a transactional
 * balance with Stripe top-up is a larger change than closing the hole. So this is the
 * floor that must exist regardless of the wallet: a verified caller, a hard per-user
 * daily cap that bounds the worst case, and a truthful record of what each account cost
 * us — which is what turns the route comment "cost is measured and billed" from a wish
 * into a fact, and gives the wallet a spend history to reconcile against when it lands.
 *
 * ## Shape
 *
 * One document per user per UTC day, `ai_usage/{uid}__{YYYY-MM-DD}`. `reserveCall` is the
 * pre-flight gate — it counts the attempt inside a transaction and refuses once the cap
 * is reached, before any provider is touched. `recordSpend` adds the real provider cost
 * and the marked-up user charge after the call returns. Both are server-only; the
 * collection is denied to every client in `firestore.rules`, so a user cannot reset their
 * own counter or read the margin the spend fields encode.
 */

/**
 * A generous ceiling for real use — the AI features (event copy, seat-map drafting,
 * recommendations) are occasional, not per-second — and a tight one for abuse: at the
 * platform's own cost per call this bounds a single farmed account to cents a day, and
 * the signup humanity gate makes many accounts expensive to create.
 */
export const AI_DAILY_CALL_CAP = 60;

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function usageRef(uid: string, now: Date) {
  return getAdminDb().collection('ai_usage').doc(`${uid}__${dayKey(now)}`);
}

export type ReserveResult =
  | { ok: true; used: number; cap: number }
  | { ok: false; reason: 'over_cap'; used: number; cap: number }
  | { ok: false; reason: 'unavailable' };

/**
 * Counts one AI call against the caller's daily allowance, atomically, BEFORE the
 * providers are contacted. Refuses once the cap is reached so a runaway or malicious
 * caller cannot spend past it. The increment lands even if the call later fails: a
 * safety cap counts attempts, not just successes, or a caller could hammer a failing
 * provider for free retries.
 */
export async function reserveAiCall(uid: string, now: Date = new Date()): Promise<ReserveResult> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' };

  const ref = usageRef(uid, now);
  try {
    return await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = Number(snap.data()?.calls ?? 0);

      if (used >= AI_DAILY_CALL_CAP) {
        return { ok: false, reason: 'over_cap', used, cap: AI_DAILY_CALL_CAP } as const;
      }

      tx.set(
        ref,
        {
          uid,
          day: dayKey(now),
          calls: FieldValue.increment(1),
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );
      return { ok: true, used: used + 1, cap: AI_DAILY_CALL_CAP } as const;
    });
  } catch {
    // A datastore fault must not become free, unmetered access — fail closed.
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Records what a completed call actually cost. Best-effort and never throws: the answer
 * is already computed and the caller is entitled to it, so a bookkeeping failure is
 * logged, not surfaced. `billing` is the internal breakdown from the gateway — provider
 * cost and the marked-up user charge — and stays server-side; only the daily document,
 * which no client can read, holds it.
 */
export async function recordAiSpend(
  uid: string,
  billing: ReturnType<typeof chargeForProviderCost>,
  now: Date = new Date()
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    await usageRef(uid, now).set(
      {
        uid,
        day: dayKey(now),
        providerCostUsd: FieldValue.increment(billing.providerCostUsd),
        userChargeUsd: FieldValue.increment(billing.userChargeUsd),
        acu: FieldValue.increment(billing.acu),
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[ai-usage] failed to record spend', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
