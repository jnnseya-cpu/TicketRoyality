import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { isStripeConfigured, readCheckoutSession, verifyWebhook } from '@/backend/payments/stripe';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { recordBookingPayment } from '@/backend/services/hospitality';
import { recordAttribution } from '@/backend/services/partners';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
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
/** The organiser a sale belongs to, so a partner cannot be credited on somebody else's event. */
async function organiserOf(eventId: string): Promise<string | undefined> {
  if (!isAdminConfigured()) return undefined;
  const snap = await getAdminDb().collection('events').doc(eventId).get();
  return snap.data()?.organizerId as string | undefined;
}

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

        /*
         * A hospitality deposit or balance, which is a payment against a booking rather
         * than a ticket sale.
         *
         * It is recorded first and issues nothing. Tickets appear only on the payment
         * that closes the balance, and even then they are not issued here — a
         * `payment_events` document is written and the function that has always issued
         * tickets does it, with the same oversell guard and the same hold consumption.
         * Adding a second issuance path would be the one thing this codebase has
         * consistently refused to grow.
         */
        if (checkout.bookingId) {
          const paid = await recordBookingPayment(
            checkout.bookingId,
            Math.round(checkout.amountTotal * 100),
            event.id
          );

          if (!paid.ok) {
            // 500 so Stripe redelivers: the buyer has been charged, and a payment we
            // failed to record is a table that stays unpaid in our records.
            if (paid.status === 503) {
              return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
            }
            console.error('[stripe] hospitality payment refused', {
              eventId: event.id,
              bookingId: checkout.bookingId,
              reason: paid.error,
            });
            return NextResponse.json({ received: true, booked: false }, { status: 202 });
          }

          if (paid.settled) {
            const outcome = await recordPaymentEvent({
              // Distinct from the booking payment's own idempotency key so the two
              // records cannot collide, and still derived from the Stripe event so a
              // replay cannot issue a second set of tickets.
              providerEventId: `${event.id}__issue`,
              provider: 'stripe',
              providerType: event.type,
              intent: 'issue',
              eventId: paid.settled.eventId,
              tierId: paid.settled.tierId,
              userId: paid.settled.buyerUserId,
              quantity: paid.settled.covers,
              // Face value per cover, as the table was sold. Not the settled total,
              // which carries the service fee and would settle a refund wrongly.
              price: paid.settled.unitFaceMinor / 100,
              currency: paid.settled.currency,
              attendeeName: checkout.customerName ?? 'Table guest',
              attendeeEmail: paid.settled.buyerEmail,
              providerRef: checkout.paymentIntentId,
              holdId: paid.settled.holdId,
            });

            if (outcome === 'unavailable') {
              return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
            }
          }

          return NextResponse.json({ received: true, booking: paid.status });
        }

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
          // Carried so issuance can move the seat from held to sold in one write.
          holdId: checkout.holdId,
          // One seat per ticket, in order. Issuance already writes these; without them a
          // seated event issues tickets with no seat on them.
          ...(checkout.seats.length > 0 ? { seats: checkout.seats } : {}),
        });

        if (outcome === 'unavailable') {
          // Firestore is unreachable. A 500 makes Stripe redeliver, which is exactly
          // what should happen — the alternative is acknowledging a payment whose
          // ticket will never be issued.
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
        }

        /*
         * Attribution, after the ticket is safely queued and never instead of it.
         *
         * A partner link that cannot be read must not cost a customer their ticket, so
         * this is deliberately not part of the issuance decision: it is recorded, its
         * failure is logged, and the webhook still acknowledges. The commission comes
         * from the stored link — the browser carried a code and nothing else.
         *
         * Idempotent by the Stripe event id, so a redelivery cannot pay a partner twice.
         */
        if (checkout.ref) {
          try {
            const organizerId = await organiserOf(checkout.eventId);
            if (organizerId) {
              await recordAttribution({
                providerEventId: event.id,
                code: checkout.ref,
                eventId: checkout.eventId,
                organizerId,
                quantity: checkout.quantity,
                // Face value, not the charged total: commission is owed on what the
                // ticket was worth, not on the service fee the buyer paid us.
                faceMinor: checkout.faceMinor,
                providerRef: checkout.paymentIntentId,
              });
            }
          } catch (error) {
            reportError(error, { scope: 'stripe.attribution', providerEventId: event.id });
          }
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
