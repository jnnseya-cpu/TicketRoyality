import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { isStripeConfigured, refundPaymentIntent } from '@/backend/payments/stripe';
import { dispatch } from '@/backend/comms/dispatch';
import { reportError } from '@/backend/observability/report-error';

/**
 * Event cancellation — the one flow where the platform owes money back at scale.
 *
 * The organiser's action does three things, in an order chosen so a crash between any
 * two of them leaves nothing dangerous behind:
 *
 * 1. **The event stops selling** — `status: 'cancelled'`, transactionally. From this
 *    moment the page is stamped, the buy box is gone, and holds cannot be placed.
 * 2. **Card money goes back by itself.** Every Stripe order for the event is refunded
 *    through the payments API, idempotently keyed by the payment event's own id — a
 *    second cancellation attempt re-sends the same keys and Stripe refuses the
 *    duplicates. The refunds land as `charge.refunded` webhooks, and THAT existing
 *    loop is what invalidates the tickets and emails each holder — cancellation does
 *    not duplicate it.
 * 3. **Free tickets are cancelled directly** (there is no money to move), and
 *    **mobile-money orders are returned as a work list** — no operator API can push
 *    money back, so the organiser refunds those transfers themselves, with the
 *    references this returns. The tickets are cancelled; the debt is theirs to settle.
 *
 * Every holder gets the mandatory `event.cancelled` notice. Redeemed tickets are
 * history, not liabilities — the event happened for them — but on a cancellation
 * before doors they will not exist in practice.
 */

export interface CancellationSummary {
  /** Stripe orders sent to the refunds API. Tickets invalidate when webhooks land. */
  refundsStarted: number;
  /** Free tickets cancelled outright. */
  freeCancelled: number;
  /** Mobile-money orders the ORGANISER must refund by hand: reference + amount. */
  manualRefunds: Array<{ reference: string; amountMinor: number; currency: string }>;
  /** Cancellation notices queued. */
  notified: number;
}

export async function cancelEvent(
  eventId: string,
  organizerId: string
): Promise<
  | { ok: true; summary: CancellationSummary }
  | { ok: false; status: 403 | 404 | 409 | 503; error: string }
> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Unavailable.' };
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);

  try {
    /* Step 1 — stop the sale, exactly once. */
    const gate = await db.runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists) return { ok: false as const, status: 404 as const, error: 'No such event.' };
      const data = snap.data() ?? {};
      if (data.organizerId !== organizerId) {
        return { ok: false as const, status: 403 as const, error: 'Not your event.' };
      }
      if (data.status === 'cancelled') {
        return { ok: false as const, status: 409 as const, error: 'Already cancelled.' };
      }
      tx.update(eventRef, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      return { ok: true as const, title: String(data.title ?? 'Event') };
    });
    if (!gate.ok) return gate;

    const summary: CancellationSummary = {
      refundsStarted: 0,
      freeCancelled: 0,
      manualRefunds: [],
      notified: 0,
    };

    /*
     * Step 2 — the money, from the payment records rather than the tickets: the
     * payment event is where the provider reference lives, and it is one refund per
     * ORDER, not per ticket. Only settled issuances refund — a pending or failed
     * payment has nothing to give back.
     */
    const payments = await db
      .collection('payment_events')
      .where('eventId', '==', eventId)
      .where('intent', '==', 'issue')
      .get();

    for (const doc of payments.docs) {
      const payment = doc.data() as {
        provider?: string;
        providerRef?: string;
        status?: string;
        price?: number;
        quantity?: number;
        currency?: string;
      };
      if (payment.status !== 'issued') continue;

      if (payment.provider === 'stripe' && payment.providerRef && isStripeConfigured()) {
        try {
          await refundPaymentIntent(payment.providerRef, `cancel_${doc.id}`);
          summary.refundsStarted += 1;
        } catch (error) {
          // One failed refund must not abandon the rest of the audience. Reported
          // loudly; the organiser's summary undercounts, which is the honest signal.
          reportError(error, { scope: 'cancellation.refund', paymentEventId: doc.id });
        }
      } else if (payment.provider === 'bitripay' || payment.provider === 'offline') {
        summary.manualRefunds.push({
          reference: payment.providerRef ?? doc.id,
          amountMinor: Math.round((payment.price ?? 0) * 100) * (payment.quantity ?? 1),
          currency: payment.currency ?? 'USD',
        });
      }
    }

    /*
     * Step 3 — the tickets money cannot reach: free ones, and the mobile-money ones
     * whose refund is now the organiser's manual job. Stripe-bought tickets are left
     * for `charge.refunded` to invalidate, so the record always says WHY they died.
     * Chunked writes; every holder gets the mandatory notice exactly once.
     */
    const tickets = await db
      .collection('tickets')
      .where('eventId', '==', eventId)
      .where('status', '==', 'valid')
      .get();

    const seen = new Set<string>();
    for (const doc of tickets.docs) {
      const ticket = doc.data() as {
        paymentProvider?: string;
        attendeeEmail?: string;
        userId?: string;
      };

      if (ticket.paymentProvider !== 'stripe') {
        await doc.ref.update({ status: 'cancelled', cancelledAt: new Date().toISOString() });
        if (ticket.paymentProvider === 'free') summary.freeCancelled += 1;
      }

      if (ticket.attendeeEmail && !seen.has(ticket.attendeeEmail)) {
        seen.add(ticket.attendeeEmail);
        await dispatch({
          eventKey: 'event.cancelled',
          recipient: { email: ticket.attendeeEmail, userId: ticket.userId },
          vars: { event: gate.title },
          body: [
            `${gate.title} has been cancelled by the organiser.`,
            'If you paid by card, your refund has been started and will arrive back on the card you paid with — you will receive a separate confirmation.',
            'If you paid by mobile money, the organiser will return your payment to the number you paid from.',
            'Free tickets are simply cancelled; there is nothing to return.',
          ],
        }).catch(() => undefined);
        summary.notified += 1;
      }
    }

    return { ok: true, summary };
  } catch (error) {
    reportError(error, { scope: 'cancellation', eventId });
    return { ok: false, status: 503, error: 'Cancellation could not be completed.' };
  }
}
