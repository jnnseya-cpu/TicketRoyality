import type { LoyaltyTier } from '@/shared/types';

/**
 * The loyalty ladder, and the comparison that gates a presale.
 *
 * Pure and isomorphic on purpose. The **server** decides whether somebody may buy, at the
 * moment their card is charged; the **buy box** uses the same function to explain why a
 * tier is unavailable before they get that far. Two implementations of "is this person a
 * member" would eventually disagree, and the version the customer sees would be the wrong
 * one — telling them they qualify and then refusing the payment.
 *
 * Computing the tier from attendance stays server-side, in `backend/services/loyalty.ts`,
 * because it reads tickets. Only the ordering lives here.
 */

const ORDER: LoyaltyTier[] = ['none', 'member', 'regular', 'patron'];

/** Attendance thresholds. Small numbers deliberately: this is a live-events business. */
export const LOYALTY_THRESHOLDS: Array<{ tier: LoyaltyTier; events: number }> = [
  { tier: 'patron', events: 10 },
  { tier: 'regular', events: 4 },
  { tier: 'member', events: 1 },
];

/** Whether `held` clears the bar set by `required`. Absent or `none` lets everybody through. */
export function meetsTier(held: LoyaltyTier, required: LoyaltyTier | undefined): boolean {
  if (!required || required === 'none') return true;
  return ORDER.indexOf(held) >= ORDER.indexOf(required);
}

export function tierForAttendance(eventsAttended: number, hasSeasonPass: boolean): LoyaltyTier {
  // A season pass is membership by definition — somebody who bought the whole run should
  // not have to wait until they have attended it before the next presale opens to them.
  if (hasSeasonPass && eventsAttended < 4) return 'regular';
  return LOYALTY_THRESHOLDS.find((t) => eventsAttended >= t.events)?.tier ?? 'none';
}

export function loyaltyLabel(tier: LoyaltyTier): string {
  switch (tier) {
    case 'patron':
      return 'Patron';
    case 'regular':
      return 'Regular';
    case 'member':
      return 'Member';
    default:
      return 'New here';
  }
}
