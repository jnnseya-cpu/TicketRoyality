import 'server-only';

import { acuToUsd, usdToAcu } from '@/shared/constants/billing';

/**
 * The AI margin. **Server-only, enforced by the compiler.**
 *
 * This used to live in `shared/constants/billing.ts`, which any client component may
 * import. That made "internal" a matter of remembering, and it was not remembered: the
 * multiplier reached the public pricing page, the terms of service, the customer wallet
 * and every `/api/ai` response before anyone noticed.
 *
 * The `import 'server-only'` above is what makes this different from a comment. A client
 * component that imports this module fails the build with a clear message, so the value
 * cannot reach a browser bundle — not the customer's, and not an administrator's either.
 *
 * What that costs: the admin console can no longer display the multiplier, because
 * displaying it means shipping it. Static JavaScript chunks are not auth-gated, so an
 * "admin-only" page is only admin-only for the person reading it, never for the bundle.
 * The number lives here, in the repository, where the people who set it can read it.
 */
export const MARKUP_MULTIPLIER = 4;

/**
 * Provider cost -> what the user is charged, in ACU.
 *
 * The full breakdown, for the ACU ledger and audit. It must not be serialised to a
 * client — use `publicCharge()` for anything that crosses an API boundary.
 */
export function chargeForProviderCost(providerCostUsd: number) {
  const userChargeUsd = providerCostUsd * MARKUP_MULTIPLIER;
  return {
    providerCostUsd,
    markupMultiplier: MARKUP_MULTIPLIER,
    userChargeUsd,
    acu: usdToAcu(userChargeUsd),
  };
}

/** What the customer is told: the price, and nothing about how it was reached. */
export interface PublicCharge {
  acu: number;
  usd: number;
}

/**
 * The customer-facing view of a charge.
 *
 * A separate function rather than "remember to delete two fields at each call site",
 * because the failure mode of the latter is silent: the response still works, it just
 * quietly publishes the margin, and nothing fails to make anyone look.
 */
export function publicCharge(providerCostUsd: number): PublicCharge {
  const acu = chargeForProviderCost(providerCostUsd).acu;
  return { acu, usd: acuToUsd(acu) };
}
