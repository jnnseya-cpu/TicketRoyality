import {
  DEFAULT_ADMIN_FEE,
  DEFAULT_COMMISSION_PERCENT,
  OFFLINE_SERVICE_FEE_PERCENT,
} from '@/shared/constants/billing';
import type { Coupon, Event, UserProfile } from '@/shared/types';

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

/** Splits gross sales into the platform's cut and the organiser's payout. */
export function settle(
  lines: Array<{ price: number }>,
  terms: CommissionTerms
): Settlement {
  const gross = lines.reduce((sum, line) => sum + line.price, 0);
  const commission = (gross * terms.percent) / 100;
  const adminFees = terms.adminFee * lines.length;
  const platformTotal = commission + adminFees;
  return {
    gross,
    commission,
    adminFees,
    platformTotal,
    net: gross - platformTotal,
  };
}

/** What the platform keeps on a single ticket. */
export function platformCutForTicket(price: number, terms: CommissionTerms) {
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

/** Cheapest live tier — what the catalogue card shows as "from". */
export function leadPrice(event: Pick<Event, 'ticketTiers'>) {
  if (event.ticketTiers.length === 0) return 0;
  return Math.min(...event.ticketTiers.map((tier) => tier.price));
}
