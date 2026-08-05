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
export const MARKUP_MULTIPLIER = 4;
export const WELCOME_BONUS_USD = 1;
export const WELCOME_BONUS_ACU = Math.round(WELCOME_BONUS_USD / ACU_USD_RATE); // 100
export const TOPUP_PACKAGES_USD = [3, 6, 9] as const;
export const MIN_BALANCE_ACU_TO_RUN_AI = 1;

export function usdToAcu(usd: number) {
  return Math.ceil(usd / ACU_USD_RATE);
}

export function acuToUsd(acu: number) {
  return acu * ACU_USD_RATE;
}

/** Provider cost -> what the user is actually charged, in ACU. */
export function chargeForProviderCost(providerCostUsd: number) {
  const userChargeUsd = providerCostUsd * MARKUP_MULTIPLIER;
  return {
    providerCostUsd,
    markupMultiplier: MARKUP_MULTIPLIER,
    userChargeUsd,
    acu: usdToAcu(userChargeUsd),
  };
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
