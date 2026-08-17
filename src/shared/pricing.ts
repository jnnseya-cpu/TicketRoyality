import {
  DEFAULT_ADMIN_FEE,
  DEFAULT_COMMISSION_PERCENT,
  OFFLINE_SERVICE_FEE_PERCENT,
} from '@/shared/constants/billing';
import type { Coupon, Event, TicketTier, UserProfile } from '@/shared/types';

/**
 * Commercial arithmetic. Isomorphic on purpose: the organiser dashboard renders these
 * numbers, the payout service pays them out, and the admin console audits them. One
 * implementation means the three can never disagree.
 *
 * Every amount is a plain number in the event's currency. Integer minor units are the
 * target model (see docs/08) — until that migration lands, do not introduce a second
 * convention here.
 */

export interface CommissionTerms {
  percent: number;
  adminFee: number;
}

/** An organiser's negotiated terms, falling back to the platform default. */
export function commissionTermsFor(profile?: Pick<UserProfile, 'commissionPercent' | 'adminFee'>): CommissionTerms {
  return {
    percent: profile?.commissionPercent ?? DEFAULT_COMMISSION_PERCENT,
    adminFee: profile?.adminFee ?? DEFAULT_ADMIN_FEE,
  };
}

export interface Settlement {
  gross: number;
  commission: number;
  adminFees: number;
  platformTotal: number;
  net: number;
}

/**
 * A free ticket carries no platform charge.
 *
 * This is the rule both functions below are built on, and it was previously broken:
 * `adminFee` was applied per line with no price check, so a £0 ticket cost the
 * organiser 50p. Percentage commission on £0 was already £0, which is what made it easy
 * to miss — the number was small and only wrong in one direction.
 *
 * It is not small at volume. A place of worship, a charity or a wedding issuing a
 * 300-place free guest list was charged £150 to give tickets away, and the industries
 * page promised the opposite in as many words. Those are exactly the segments a free
 * tier exists to reach.
 *
 * A donation tier priced above zero is a paid ticket and is charged normally.
 */
function isFree(price: number): boolean {
  return price <= 0;
}

/** Splits gross sales into the platform's cut and the organiser's payout. */
export function settle(
  lines: Array<{ price: number }>,
  terms: CommissionTerms
): Settlement {
  const gross = lines.reduce((sum, line) => sum + line.price, 0);
  const commission = (gross * terms.percent) / 100;
  // Counted over paid lines only, so this stays the sum of `platformCutForTicket`
  // across the same lines. Two ways of computing one number is how a settlement report
  // and a payout end up disagreeing by pennies that nobody can account for.
  const adminFees = terms.adminFee * lines.filter((line) => !isFree(line.price)).length;
  const platformTotal = commission + adminFees;
  return {
    gross,
    commission,
    adminFees,
    platformTotal,
    net: gross - platformTotal,
  };
}

/** What the platform keeps on a single ticket. Zero on a free one. */
export function platformCutForTicket(price: number, terms: CommissionTerms) {
  if (isFree(price)) return 0;
  return (price * terms.percent) / 100 + terms.adminFee;
}

/** Mobile-money service charge, paid by the customer on top of the ticket price. */
export function offlineTotal(amount: number) {
  const serviceFee = (amount * OFFLINE_SERVICE_FEE_PERCENT) / 100;
  return { baseAmount: amount, serviceFee, totalAmount: amount + serviceFee };
}

export type CouponCheck =
  | { valid: true; discount: number; total: number }
  | { valid: false; reason: 'expired' | 'exhausted' | 'not_found' };

/**
 * Coupon validation. Runs on the client for instant feedback and again on the server
 * before the charge — the client result is advisory, the server result is binding.
 */
export function applyCoupon(subtotal: number, coupon: Coupon | null, now = Date.now()): CouponCheck {
  if (!coupon) return { valid: false, reason: 'not_found' };
  if (new Date(coupon.expiresAt).getTime() < now) return { valid: false, reason: 'expired' };
  if (coupon.usageCount >= coupon.usageLimit) return { valid: false, reason: 'exhausted' };

  const discount =
    coupon.discountType === 'percentage'
      ? (subtotal * coupon.amount) / 100
      : Math.min(coupon.amount, subtotal);

  return { valid: true, discount, total: Math.max(0, subtotal - discount) };
}

/** Remaining inventory for a tier: quantity less what is sold and what is held in checkout. */
export function availableInTier(tier: { quantity: number; sold?: number; held?: number }) {
  return tier.quantity - (tier.sold ?? 0) - (tier.held ?? 0);
}

/**
 * The one place that decides what a buyer is charged for a line.
 *
 * ## Why a posted amount is ever accepted
 *
 * Everywhere else, a price posted by a browser is ignored and re-read from Firestore —
 * that is what stops a £250 ticket being bought for a penny. Pay-what-you-want inverts
 * the question: the buyer's amount *is* the price, and the only thing the server owes
 * anyone is the floor the organiser set.
 *
 * So this is not a hole in that rule, it is the rule stated precisely: **a fixed tier
 * ignores the request entirely**, and a `choose` tier accepts it only above the tier's
 * own minimum. A tier that was never marked `choose` cannot be turned into one by a
 * crafted POST, because the mode is read from the stored event and not from the form.
 *
 * The ceiling exists to stop a typo becoming a card decline nobody understands, and is
 * far above any real gift.
 */
export const CHOSEN_PRICE_CEILING = 100_000;

export function resolveLinePrice(
  tier: Pick<TicketTier, 'price' | 'pricing' | 'minPrice'>,
  requestedMajor: number | undefined
): number {
  if (tier.pricing !== 'choose') return tier.price;

  const floor = Math.max(0, tier.minPrice ?? 0);
  const requested = Number(requestedMajor);
  if (!Number.isFinite(requested)) return floor;

  // Rounded to the penny here rather than at the payment provider, so what the buyer is
  // told they are giving and what leaves their card are the same number.
  const rounded = Math.round(requested * 100) / 100;
  return Math.min(CHOSEN_PRICE_CEILING, Math.max(floor, rounded));
}

/**
 * Cheapest live tier — what the catalogue card shows as "from".
 *
 * Hidden tiers are excluded. A partner rate cheaper than general admission would
 * otherwise set the public "from" price, advertising a number nobody without the code
 * can actually pay — which is both a false price and a leak of the discount.
 */
export function leadPrice(event: Pick<Event, 'ticketTiers'>) {
  const sellable = event.ticketTiers.filter((tier) => tier.visibility !== 'hidden');
  if (sellable.length === 0) return 0;
  return Math.min(...sellable.map((tier) => tier.price));
}
