import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * The handoff from a payment webhook to the issuance function.
 *
 * A webhook handler must do two things and only two things: verify the signature, and
 * durably record what arrived. It must not issue tickets inline. Stripe abandons a
 * delivery that takes more than a few seconds and marks it failed, and a Firestore
 * transaction under on-sale contention is exactly the operation that occasionally
 * takes longer than that — so inline issuance turns a slow moment into a payment the
 * provider believes was never acknowledged.
 *
 * Writing one document is fast and safe to retry. `functions/src/index.ts` picks it up
 * from there, with platform retries and a reconciliation sweep behind it.
 */

export type PaymentIntent = 'issue' | 'refund' | 'ignore';

export interface RecordPaymentEvent {
  /** The provider's own event id. Becomes the document id, and therefore the idempotency key. */
  providerEventId: string;
  provider: 'stripe' | 'bitripay' | 'offline' | 'free';
  providerType: string;
  intent: PaymentIntent;

  eventId: string;
  tierId: string;
  userId: string;
  quantity: number;
  price: number;
  currency: string;
  attendeeName: string;
  attendeeEmail: string;
  seats?: string[];

  /**
   * The identifier shared between a payment and its refund — Stripe's payment intent
   * id. Set on issuance so `charge.refunded` can find the tickets to reverse; a
   * refund event sets `refundsRef` to the same value instead.
   */
  providerRef?: string;
  refundsRef?: string;
  /** The checkout hold this payment consumes, so issuance can release it atomically. */
  holdId?: string;
}

export type RecordOutcome = 'recorded' | 'duplicate' | 'unavailable';

/**
 * Records a provider event exactly once.
 *
 * `create` rather than `set`: it fails if the document already exists, which is how a
 * replayed webhook is rejected by the database rather than by a flag in memory. The
 * previous implementation used an in-process `Set`, which empties on every deploy and
 * is not shared between instances — two instances plus one replay is two sets of
 * tickets for one payment.
 */
export async function recordPaymentEvent(input: RecordPaymentEvent): Promise<RecordOutcome> {
  if (!isAdminConfigured()) return 'unavailable';

  const db = getAdminDb();
  const ref = db.collection('payment_events').doc(input.providerEventId);

  try {
    await ref.create({
      ...input,
      status: 'pending',
      attempts: 0,
      receivedAt: new Date().toISOString(),
    });
    return 'recorded';
  } catch (error) {
    // ALREADY_EXISTS. The first delivery is already recorded and being processed, so
    // this one has nothing to do — which is a success, not an error.
    if ((error as { code?: number | string }).code === 6) return 'duplicate';
    throw error;
  }
}
