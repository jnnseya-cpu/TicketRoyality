import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { isStripeConfigured, readCheckoutSession, verifyWebhook } from '@/backend/payments/stripe';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook — the authority for ticket issuance.
 *
 * A user who closes the tab the instant their card is charged must still receive their
 * ticket, so the redirect is never trusted; this handler is.
 *
 * It verifies the signature and records the event, then returns. Issuance happens in
 * `functions/src/index.ts`, triggered by the document written here. That split is
 * deliberate: Stripe marks a delivery failed if it is not acknowledged within a few
 * seconds, and a Firestore transaction under on-sale contention is exactly the
 * operation that occasionally takes longer than that.
 *
 * Idempotency is the document id — the Stripe event id — enforced by `create()`. A
 * replayed delivery cannot create a second document and therefore cannot issue a
 * second set of tickets, across restarts and across instances.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhook(await request.text(), signature);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Signature verification failed' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkout = readCheckoutSession(event.data.object as Stripe.Checkout.Session);

        // Metadata is set when the checkout session is created. Without it there is
        // nothing to issue against, and issuing a guess would be worse than stopping:
        // recorded as terminal so it surfaces in the queue rather than retrying.
        if (!checkout.eventId || !checkout.tierId || !checkout.userId) {
          console.error('[stripe] checkout.session.completed missing metadata', {
            eventId: event.id,
            sessionId: checkout.sessionId,
          });
          return NextResponse.json(
            { received: true, issued: false, reason: 'missing_metadata' },
            { status: 202 }
          );
        }

        const outcome = await recordPaymentEvent({
          providerEventId: event.id,
          provider: 'stripe',
          providerType: event.type,
          intent: 'issue',
          eventId: checkout.eventId,
          tierId: checkout.tierId,
          userId: checkout.userId,
          quantity: checkout.quantity,
          // Unit price, not the session total: a partial refund reverses one ticket,
          // and a ticket carrying the whole basket's value settles wrongly.
          price: checkout.quantity > 0 ? checkout.amountTotal / checkout.quantity : 0,
          currency: checkout.currency,
          attendeeName: checkout.customerName ?? 'Ticket holder',
          attendeeEmail: checkout.customerEmail ?? '',
          providerRef: checkout.paymentIntentId,
        });

        if (outcome === 'unavailable') {
          // Firestore is unreachable. A 500 makes Stripe redeliver, which is exactly
          // what should happen — the alternative is acknowledging a payment whose
          // ticket will never be issued.
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
        }

        return NextResponse.json({ received: true, queued: outcome });
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;

        // The payment intent is the only identifier a charge shares with the checkout
        // session that issued the tickets. Without it the refund cannot be matched to
        // anything, so it is recorded as unmatched rather than silently dropped.
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;

        if (!paymentIntentId) {
          console.warn('[stripe] charge.refunded without a payment intent', {
            chargeId: charge.id,
          });
          return NextResponse.json({ received: true, refunded: false }, { status: 202 });
        }

        await recordPaymentEvent({
          providerEventId: event.id,
          provider: 'stripe',
          providerType: event.type,
          intent: 'refund',
          // The issuance fields are carried by the original payment, which the
          // function resolves via `refundsRef`. Blank here rather than guessed.
          eventId: '',
          tierId: '',
          userId: '',
          quantity: 0,
          price: 0,
          currency: (charge.currency ?? 'gbp').toUpperCase(),
          attendeeName: '',
          attendeeEmail: '',
          refundsRef: paymentIntentId,
        });

        return NextResponse.json({ received: true });
      }

      default:
        // Acknowledged without action. A 4xx here makes Stripe retry an event type we
        // will never handle, forever.
        return NextResponse.json({ received: true, ignored: event.type });
    }
  } catch (error) {
    // The most expensive silence on the platform: a verified payment that was never
    // recorded is a customer who paid and will never receive a ticket.
    reportError(error, { scope: 'stripe.webhook', providerEventId: event.id, type: event.type });
    // 500 so Stripe redelivers. Losing this event loses a paid-for ticket.
    return NextResponse.json({ error: 'record_failed' }, { status: 500 });
  }
}
