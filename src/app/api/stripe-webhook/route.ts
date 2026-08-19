import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import {
  isStripeConfigured,
  readCheckoutSession,
  readSubscription,
  verifyWebhook,
} from '@/backend/payments/stripe';
import { applyPaidMove, applyPaidTierUpgrade } from '@/backend/services/seat-swap';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { recordBookingPayment } from '@/backend/services/hospitality';
import { recordAttribution } from '@/backend/services/partners';
import { recordDonation } from '@/backend/services/donations';
import { recordContribution } from '@/backend/services/registry';
import { queueEvent } from '@/backend/services/webhooks';
import { settlePassPurchase } from '@/backend/services/season-passes';
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
         * A gift, recorded before anything else in this branch and independently of it.
         *
         * It rides on the same card payment as the tickets, but it is a different thing
         * in law: Gift Aid is claimed on a gift and never on a payment for admission. So
         * it gets its own record, keyed by its own id derived from this Stripe event, and
         * the ticket issuance below is untouched by it. A donation that fails to record
         * must not cost anyone their tickets, so this never returns early on failure —
         * it reports and carries on.
         */
        if (checkout.donationMinor > 0 && checkout.donationOrganiserId) {
          const recorded = await recordDonation({
            providerEventId: `${event.id}__gift`,
            organizerId: checkout.donationOrganiserId,
            eventId: checkout.eventId,
            userId: checkout.userId,
            donorName: checkout.customerName ?? 'Anonymous',
            donorEmail: checkout.customerEmail ?? '',
            amountMinor: checkout.donationMinor,
            currency: checkout.currency,
            providerRef: checkout.paymentIntentId,
          });

          if (recorded === 'unavailable') {
            reportError(new Error('donation not recorded'), {
              scope: 'stripe.donation',
              stripeEventId: event.id,
            });
          }

          if (recorded === 'recorded') {
            // Queued, never sent from here: a gift is recorded whether or not somebody
            // else's server is up.
            await queueEvent(checkout.donationOrganiserId, 'donation.received', {
              amountMinor: checkout.donationMinor,
              currency: checkout.currency,
              eventId: checkout.eventId ?? null,
            });
          }
        }

        /*
         * A gift registry contribution. Its own transaction, which also moves the item's
         * running total — recorded here rather than in the browser because two guests
         * giving at the same moment must both count, and a couple thanking somebody for
         * a gift the list forgot is worse than a wrong number.
         */
        if (checkout.registryMinor > 0 && checkout.registryItemId) {
          const contributed = await recordContribution({
            providerEventId: `${event.id}__registry`,
            itemId: checkout.registryItemId,
            amountMinor: checkout.registryMinor,
            giverName: checkout.customerName ?? 'Anonymous',
            giverEmail: checkout.customerEmail ?? '',
            message: checkout.registryMessage,
            userId: checkout.userId,
          });

          if (!contributed.ok && contributed.reason === 'unavailable') {
            // 500 so Stripe redelivers: the guest has paid and the couple's list does not
            // know about it, which is exactly the gift that gets forgotten.
            return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
          }

          if (!checkout.eventId && !checkout.bookingId && !checkout.passId) {
            return NextResponse.json({ received: true, registry: contributed.ok });
          }
        }

        // A gift on its own — no tickets to issue, nothing further to do here.
        if (checkout.donationMinor > 0 && !checkout.eventId && !checkout.bookingId && !checkout.passId) {
          return NextResponse.json({ received: true, donation: true });
        }

        /*
         * A monthly gift starting. The money for it arrives as `invoice.paid`, including
         * the first month, so there is deliberately nothing to record here — and without
         * this the session would fall through to the ticket branch and be logged as an
         * error for missing metadata it was never supposed to have.
         */
        if ((event.data.object as Stripe.Checkout.Session).mode === 'subscription') {
          return NextResponse.json({ received: true, recurring: 'started' });
        }

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

        /*
         * A season pass. One payment, a ticket in every covered fixture.
         *
         * Each issuance gets its own id derived from this payment and the event, so the
         * whole thing is idempotent per fixture and a redelivery creates nothing. The
         * tickets come out of the issuance that already exists — there is still only one.
         */
        /*
         * A paid seat upgrade — docs/24 §14. The difference was charged; the move lands
         * here, idempotent by the Stripe event id, in one transaction covering the
         * ticket, both tiers' counters, the hold and the seat lock. A failure after a
         * successful charge is reported loudly, never swallowed: money with no seat is
         * the operations queue's most urgent kind of row.
         */
        if (checkout.upgradeTicketId && checkout.upgradeToTierId) {
          // With a seat: the seated upgrade (ticket moves INTO that chair). Without:
          // a general-admission tier upgrade — same money-first rule, no chair involved.
          const moved = checkout.upgradeToSeat
            ? await applyPaidMove({
                providerEventId: event.id,
                ticketId: checkout.upgradeTicketId,
                toSeat: checkout.upgradeToSeat,
                toTierId: checkout.upgradeToTierId,
                differenceMajor: checkout.upgradeDiff,
                holdId: checkout.holdId,
              })
            : await applyPaidTierUpgrade({
                providerEventId: event.id,
                ticketId: checkout.upgradeTicketId,
                toTierId: checkout.upgradeToTierId,
                differenceMajor: checkout.upgradeDiff,
                holdId: checkout.holdId,
              });

          if (!moved.ok) {
            // 500 → Stripe redelivers; a transient race gets another chance before a
            // human has to look.
            return NextResponse.json({ error: moved.error ?? 'upgrade_failed' }, { status: 500 });
          }
          return NextResponse.json({ received: true, upgraded: !moved.duplicate });
        }

        if (checkout.passId) {
          const settled = await settlePassPurchase({
            providerEventId: event.id,
            passId: checkout.passId,
            userId: checkout.userId ?? '',
            attendeeName: checkout.customerName ?? 'Pass holder',
            attendeeEmail: checkout.customerEmail ?? '',
            providerRef: checkout.paymentIntentId,
          });

          if (!settled.ok && settled.reason === 'unavailable') {
            // 500 so Stripe redelivers: a paid pass with no tickets is the worst
            // outcome available here.
            return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
          }

          return NextResponse.json({ received: true, pass: settled.ok ? settled.issued : 0 });
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
          // The attendee-type breakdown. Issuance prices each ticket from this when
          // present; `price` above stays the order average for refund arithmetic.
          ...(checkout.mix ? { mix: checkout.mix } : {}),
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
         * `order.completed`, for anyone integrating against us.
         *
         * Queued after the payment is safely recorded and never instead of it, and it
         * says the money arrived rather than that tickets exist — issuance runs in
         * `functions/`, so claiming otherwise from here would be a guess about something
         * that has not happened yet.
         */
        try {
          const organizerId = await organiserOf(checkout.eventId);
          if (organizerId) {
            await queueEvent(organizerId, 'order.completed', {
              eventId: checkout.eventId,
              tierId: checkout.tierId,
              quantity: checkout.quantity,
              amountMinor: Math.round(checkout.amountTotal * 100),
              currency: checkout.currency,
            });
          }
        } catch (error) {
          // A webhook nobody can queue must never cost a customer their ticket.
          reportError(error, { scope: 'stripe.queueOrder', stripeEventId: event.id });
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

      /*
       * A month of a standing gift.
       *
       * `invoice.paid` arrives every month for the life of the subscription, including
       * the first one — so the checkout that started it records nothing, and every
       * instalment including the first comes through here. Two paths recording the first
       * month would double it, which is exactly the kind of error a donor notices on their
       * statement and a charity never notices at all.
       *
       * The charity comes from the **subscription's** metadata rather than the invoice's:
       * by month eleven the checkout session that carried it no longer exists.
       */
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : (invoice.subscription?.id ?? '');

        if (!subscriptionId) return NextResponse.json({ received: true, recurring: false });

        let subscription: Awaited<ReturnType<typeof readSubscription>>;
        try {
          subscription = await readSubscription(subscriptionId);
        } catch (error) {
          // 500 so Stripe redelivers: the donor has been charged and we cannot yet say
          // who for, which is a gift that would otherwise vanish.
          reportError(error, { scope: 'stripe.subscription', subscriptionId });
          return NextResponse.json({ error: 'subscription_unreadable' }, { status: 500 });
        }

        if (!subscription.organiserId) {
          console.error('[stripe] invoice.paid with no charity', { subscriptionId });
          return NextResponse.json({ received: true, recurring: false }, { status: 202 });
        }

        const recorded = await recordDonation({
          // The Stripe event id, so a redelivered invoice records one gift and not two.
          providerEventId: event.id,
          organizerId: subscription.organiserId,
          userId: subscription.userId,
          donorName: invoice.customer_name ?? 'Anonymous',
          donorEmail: invoice.customer_email ?? '',
          amountMinor: invoice.amount_paid ?? 0,
          currency: (invoice.currency ?? 'gbp').toUpperCase(),
          recurringId: subscriptionId,
        });

        if (recorded === 'unavailable') {
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 500 });
        }

        return NextResponse.json({ received: true, recurring: recorded });
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
