import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * Marks a paid basket issued and, if it carried a coupon, records that one redemption —
 * both inside a single transaction, so a coupon's `usageCount` advances exactly once per
 * paid order however many times the payment provider redelivers the webhook.
 *
 * ## The leak this closes
 *
 * `applyCoupon` refuses a code once `usageCount >= usageLimit`, but nothing anywhere
 * incremented `usageCount`: it was written 0 at creation, read at checkout, and never
 * moved. So the limit was decorative — a single-use "100% off" code, or a "50% off, first
 * 100 buyers" code, worked an unlimited number of times. Coupons only reach the basket
 * path, so the count is settled here, off the `cart_orders` document both webhooks read.
 *
 * The status transition is the idempotency guard: the increment rides the pending →
 * issued flip, and a redelivered webhook finds the order already issued and does nothing.
 * Under the rare concurrent last-use race two orders may both pass the checkout-time check
 * and settle, so a limit can be exceeded by the number of genuinely simultaneous
 * checkouts — bounded and tiny, where the old behaviour was unbounded.
 */
export type SettleResult = 'issued' | 'already' | 'skipped' | 'unavailable';

export async function settleCartOrderRedemption(cartOrderId: string): Promise<SettleResult> {
  if (!cartOrderId || !isAdminConfigured()) return 'skipped';

  const db = getAdminDb();
  const orderRef = db.collection('cart_orders').doc(cartOrderId);

  try {
    return await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return 'skipped';

      const order = orderSnap.data() as { status?: string; couponId?: string };
      if (order.status === 'issued') return 'already';

      // A coupon may have been deleted between checkout and payment — read it inside the
      // transaction so a missing one is skipped rather than failing the whole settlement
      // (and with it the order's issued flag).
      const couponId = order.couponId;
      const couponRef = couponId ? db.collection('coupons').doc(couponId) : null;
      const couponExists = couponRef ? (await tx.get(couponRef)).exists : false;

      tx.update(orderRef, { status: 'issued', issuedAt: new Date().toISOString() });
      if (couponRef && couponExists) {
        tx.update(couponRef, { usageCount: FieldValue.increment(1) });
      }
      return 'issued';
    });
  } catch {
    return 'unavailable';
  }
}
