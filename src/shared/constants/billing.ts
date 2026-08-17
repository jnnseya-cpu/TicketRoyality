/**
 * ACU (AI Credit Unit) billing configuration.
 *
 * 1 ACU = $0.01. AI calls are billed at the real provider cost times an internal
 * multiplier, converted to ACU and rounded up. That multiplier is deliberately not in
 * this file — see `backend/billing/margin.ts`.
 *
 * ACU is a *currency* unit, deliberately not a token count. A fixed
 * tokens-per-ACU rate cannot also be a fixed multiple of provider cost, because
 * models differ in price per token by more than an order of magnitude and input
 * and output tokens are priced differently. Pricing on cost keeps the margin
 * constant; token counts are reported separately in the usage dashboard.
 */
export const ACU_USD_RATE = 0.01;

/**
 * The AI margin lives in `backend/billing/margin.ts`, not here.
 *
 * This module is `shared`, so any client component may import it — which is exactly how
 * the multiplier ended up on the public pricing page. Over there it carries
 * `import 'server-only'`, so a client component that reaches for it fails the build.
 */

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
 * Organiser commission. Zero, and no longer a default that anyone negotiates away from.
 *
 * The platform used to charge organisers 5% + 50p per paid ticket. It now charges them
 * nothing at all and pays them 100% of face value; all standard platform revenue is the
 * buyer-side service fee in `shared/fees.ts`.
 *
 * These two constants are kept rather than deleted because `commissionTermsFor()` still
 * honours a per-organiser override, and a bespoke agreement is a real thing a superuser
 * may one day set. What changed is the floor everyone starts on.
 */
export const DEFAULT_COMMISSION_PERCENT = 0;
export const DEFAULT_ADMIN_FEE = 0;

/** Offline (Congolese mobile money) payment settings. */
export const OFFLINE_SERVICE_FEE_PERCENT = 2;

export const OFFLINE_PROVIDERS = [
  { id: 'vodacom', name: 'Vodacom M-Pesa', number: '+243 81 000 0001' },
  { id: 'airtel', name: 'Airtel Money', number: '+243 99 000 0002' },
  { id: 'orange', name: 'Orange Money', number: '+243 89 000 0003' },
  { id: 'africell', name: 'Africell Money', number: '+243 90 000 0004' },
] as const;
