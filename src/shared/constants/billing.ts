/**
 * ACU (AI Credit Unit) billing configuration.
 *
 * 1 ACU = $0.01. AI calls are billed at the real provider cost multiplied by
 * MARKUP_MULTIPLIER, converted to ACU and rounded up.
 *
 * ACU is a *currency* unit, deliberately not a token count. A fixed
 * tokens-per-ACU rate cannot also be a fixed multiple of provider cost, because
 * models differ in price per token by more than an order of magnitude and input
 * and output tokens are priced differently. Pricing on cost keeps the margin
 * constant; token counts are reported separately in the usage dashboard.
 */
export const ACU_USD_RATE = 0.01;

/**
 * **Internal. Never render this, or anything derived from it, to a customer.**
 *
 * It is the platform's gross margin on AI, and publishing it does two things: it tells
 * every competitor what the model calls actually cost, and it invites the reasonable
 * question "why am I paying four times what you pay?" — a question about a number the
 * customer never needed, because what they are buying is priced in ACU and shown before
 * they spend any.
 *
 * The public contract is the ACU price and nothing else. `chargeForProviderCost` returns
 * the full breakdown for the ledger and the admin console; `publicCharge` is what may
 * cross an API boundary.
 */
export const MARKUP_MULTIPLIER = 4;

export const WELCOME_BONUS_USD = 1;
/** 100 ACU, free on every new account. */
export const WELCOME_BONUS_ACU = Math.round(WELCOME_BONUS_USD / ACU_USD_RATE); // 100
export const TOPUP_PACKAGES_USD = [5, 10, 15] as const;
export const MIN_BALANCE_ACU_TO_RUN_AI = 1;

export function usdToAcu(usd: number) {
  return Math.ceil(usd / ACU_USD_RATE);
}

export function acuToUsd(acu: number) {
  return acu * ACU_USD_RATE;
}

/**
 * Provider cost -> what the user is charged, in ACU.
 *
 * **Internal.** The returned object carries `providerCostUsd` and `markupMultiplier`,
 * which belong in the ledger and the admin console and must not leave the server. Use
 * `publicCharge()` for anything a client can read.
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

/** Platform commission defaults, overridable per organiser by the superuser. */
export const DEFAULT_COMMISSION_PERCENT = 5;
export const DEFAULT_ADMIN_FEE = 0.5;

/** Offline (Congolese mobile money) payment settings. */
export const OFFLINE_SERVICE_FEE_PERCENT = 2;

export const OFFLINE_PROVIDERS = [
  { id: 'vodacom', name: 'Vodacom M-Pesa', number: '+243 81 000 0001' },
  { id: 'airtel', name: 'Airtel Money', number: '+243 99 000 0002' },
  { id: 'orange', name: 'Orange Money', number: '+243 89 000 0003' },
  { id: 'africell', name: 'Africell Money', number: '+243 90 000 0004' },
] as const;
