import { NextResponse } from 'next/server';

import { fromKodaAmount, verifyWebhook } from '@/backend/payments/koda';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { activatePlacement } from '@/backend/services/promotions';
import { recordBookingPayment } from '@/backend/services/hospitality';
import { recordContribution } from '@/backend/services/registry';
import { recordDonation } from '@/backend/services/donations';
import { settlePassPurchase } from '@/backend/services/season-passes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KODA payment verification webhook — https://ticketroyality.com/webhooks/koda
 *
 * The path is registered with KODA and must not change without re-registering there
 * first. A moved webhook URL is silent: KODA keeps posting to the old path, gets a
 * 404, retries for 24 hours and gives up, and the first symptom is a customer saying
 * they paid and got nothing.
 *
 * This is the source of truth for a direct mobile-money payment, not the browser
 * redirect (docs/20 §20.6). A customer whose signal drops the instant their code is
 * accepted still gets their ticket.
 *
 * As with Stripe, this handler verifies and records; issuance happens in the Cloud
 * Function triggered by the document it writes.
 */

/** The intent metadata we set at checkout and KODA echoes back. */
interface KodaMetadata {
  eventId?: string;
  tierId?: string;
  userId?: string;
  quantity?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  /** Issuance consumes the hold so seats go held → sold in one step. */
  holdId?: string;
  /** Comma-joined seat labels, one per ticket, in mix order. */
  seats?: string;
  /** JSON-encoded MixEntry[] for a mixed-price order. */
  mix?: string;
  /** Set when the intent buys a homepage/newsletter placement, not tickets. */
  promoPlacement?: string;
  promoEventId?: string;
  /** Set when the intent pays a BASKET — the order document carries the lines. */
  cartOrderId?: string;
  /** Set when the intent pays a hospitality deposit or balance, not tickets. */
  bookingId?: string;
  /** Set when the intent is a gift-registry contribution. */
  registryItemId?: string;
  registryMessage?: string;
  /** A one-off gift riding a ticket order — recorded separately, no platform fee. */
  donationMinor?: string;
  donationOrganiserId?: string;
  /** Set when the intent buys a season pass — settles into every covered fixture. */
  passId?: string;
  /** §16 quote fields, set at intent creation and persisted onto the payment event. */
  pricingVersion?: string;
  feeConfigVersion?: string;
  faceMinor?: string;
  serviceFeeMinor?: string;
  buyerTotalMinor?: string;
}

export async function POST(request: Request) {
  // Read the raw body first. Parsing and re-serialising changes key order and
  // whitespace, which breaks the HMAC every time.
  const raw = await request.text();
  const signature = request.headers.get('x-koda-signature');

  if (!verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: {
    id?: string;
    type?: string;
    data?: {
      intent_id?: string;
      receipt_id?: string;
      amount?: number;
      currency?: string;
      metadata?: KodaMetadata;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  switch (payload.type) {
    case 'payment.verified':
    case 'payment.verified.late': {
      const data = payload.data ?? {};
      const meta = data.metadata ?? {};

      // KODA's own event id keys idempotency. Falling back to the intent id is
      // deliberate: a late verification for the same intent must not issue a second
      // set of tickets, and the intent is what both deliveries have in common.
      const providerEventId = payload.id ?? data.intent_id;

      /*
       * A paid placement over mobile money — same activation as the Stripe rail,
       * idempotent by the provider event id, so KODA's retries cannot extend a
       * placement twice.
       */
      if (providerEventId && meta.promoPlacement && meta.promoEventId) {
        const activated = await activatePlacement({
          providerEventId,
          placementId: meta.promoPlacement,
          eventId: meta.promoEventId,
          userId: meta.userId ?? '',
          amountMajor: data.amount
            ? fromKodaAmount(data.currency ?? 'USD', data.amount) / 100
            : 0,
          currency: (data.currency ?? 'USD').toUpperCase(),
        });
        if (activated === 'unavailable') {
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }
        return NextResponse.json({ received: true, placement: activated });
      }

      /*
       * A season pass over mobile money — settles into one ticket per covered
       * fixture through the same `settlePassPurchase` the Stripe rail uses,
       * idempotent per fixture by ids derived from this payment.
       */
      if (providerEventId && meta.passId) {
        const settled = await settlePassPurchase({
          providerEventId,
          passId: meta.passId,
          userId: meta.userId ?? '',
          attendeeName: meta.attendeeName ?? 'Pass holder',
          attendeeEmail: meta.attendeeEmail ?? '',
          providerRef: data.intent_id,
        });
        if (!settled.ok && settled.reason === 'unavailable') {
          // 5xx so KODA retries: a paid pass with no tickets is the worst outcome.
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }
        return NextResponse.json({ received: true, pass: settled.ok ? settled.issued : 0 });
      }

      /*
       * A hospitality deposit or balance over mobile money. Recorded against the
       * booking; tickets appear only when the payment closes the balance, and even
       * then through the one issuance path — the same division the Stripe rail keeps.
       */
      if (providerEventId && meta.bookingId) {
        const paid = await recordBookingPayment(
          meta.bookingId,
          data.amount ? fromKodaAmount(data.currency ?? 'USD', data.amount) : 0,
          providerEventId
        );

        if (!paid.ok) {
          if (paid.status === 503) {
            return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
          }
          console.error('[koda] hospitality payment refused', {
            providerEventId,
            bookingId: meta.bookingId,
            reason: paid.error,
          });
          return NextResponse.json({ received: true, booked: false }, { status: 202 });
        }

        if (paid.settled) {
          const outcome = await recordPaymentEvent({
            providerEventId: `${providerEventId}__issue`,
            provider: 'bitripay',
            providerType: payload.type ?? 'payment.verified',
            intent: 'issue',
            eventId: paid.settled.eventId,
            tierId: paid.settled.tierId,
            userId: paid.settled.buyerUserId,
            quantity: paid.settled.covers,
            price: paid.settled.unitFaceMinor / 100,
            currency: paid.settled.currency,
            attendeeName: meta.attendeeName ?? 'Table guest',
            attendeeEmail: paid.settled.buyerEmail,
            providerRef: data.intent_id,
            holdId: paid.settled.holdId,
          });
          if (outcome === 'unavailable') {
            return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
          }
        }

        return NextResponse.json({ received: true, booking: paid.status });
      }

      /*
       * A gift-registry contribution over mobile money — its own transaction, moving
       * the item's running total, same as the Stripe rail.
       */
      if (providerEventId && meta.registryItemId) {
        const contributed = await recordContribution({
          providerEventId,
          itemId: meta.registryItemId,
          amountMinor: data.amount ? fromKodaAmount(data.currency ?? 'USD', data.amount) : 0,
          giverName: meta.attendeeName ?? 'Anonymous',
          giverEmail: meta.attendeeEmail ?? '',
          message: meta.registryMessage,
          userId: meta.userId,
        });
        if (!contributed.ok && contributed.reason === 'unavailable') {
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }
        return NextResponse.json({ received: true, registry: contributed.ok });
      }

      /*
       * A basket paid by mobile money. The order document `/api/checkout` wrote holds
       * every line — seats, mixes and the holds that reserved them — and each line
       * issues as its own payment event, idempotent by `${providerEventId}__{index}`,
       * exactly as the Stripe webhook does it.
       */
      if (providerEventId && meta.cartOrderId) {
        if (!isAdminConfigured()) {
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }
        const orderSnap = await getAdminDb()
          .collection('cart_orders')
          .doc(meta.cartOrderId)
          .get();
        const order = orderSnap.data() as
          | {
              userId?: string;
              currency?: string;
              lines?: Array<{
                eventId: string;
                tierId: string;
                quantity: number;
                unitMajor: number;
                holdId?: string;
                seats?: string[];
                mix?: Array<{ typeId: string; typeName: string; price: number; quantity: number }>;
              }>;
            }
          | undefined;

        if (!order?.lines?.length || !order.userId) {
          // The checkout wrote this document before creating the intent; its absence
          // is a datastore fault. 5xx → KODA redelivers.
          console.error('[koda] cart order missing', { cartOrderId: meta.cartOrderId });
          return NextResponse.json({ error: 'cart_order_missing' }, { status: 503 });
        }

        for (const [index, line] of order.lines.entries()) {
          const outcome = await recordPaymentEvent({
            providerEventId: `${providerEventId}__${index}`,
            provider: 'bitripay',
            providerType: payload.type ?? 'payment.verified',
            intent: 'issue',
            eventId: line.eventId,
            tierId: line.tierId,
            userId: order.userId,
            quantity: line.quantity,
            price: line.unitMajor,
            currency: (order.currency ?? data.currency ?? 'CDF').toUpperCase(),
            attendeeName: meta.attendeeName ?? 'Ticket holder',
            attendeeEmail: meta.attendeeEmail ?? '',
            providerRef: data.intent_id,
            holdId: line.holdId,
            ...(line.seats?.length ? { seats: line.seats } : {}),
            ...(line.mix?.length ? { mix: line.mix } : {}),
          });
          if (outcome === 'unavailable') {
            // Already-written lines are idempotent by document id; a redelivery
            // resumes where this stopped and cannot issue twice.
            return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
          }
        }

        await getAdminDb()
          .collection('cart_orders')
          .doc(meta.cartOrderId)
          .update({ status: 'issued', issuedAt: new Date().toISOString() })
          .catch(() => {});

        return NextResponse.json({ received: true, items: order.lines.length });
      }

      if (!providerEventId || !meta.eventId || !meta.tierId || !meta.userId) {
        console.error('[koda] verified payment missing metadata', {
          intentId: data.intent_id,
          type: payload.type,
        });
        // 202 rather than 200: acknowledged, but explicitly not issued, and KODA is
        // told the outcome rather than being left to assume success.
        return NextResponse.json(
          { received: true, issued: false, reason: 'missing_metadata' },
          { status: 202 }
        );
      }

      const quantity = Math.max(1, Number(meta.quantity ?? 1));

      /*
       * A gift riding the order — recorded first and independently, exactly as the
       * Stripe webhook does it: a donation that fails to record must never cost
       * anyone their tickets, so this reports and carries on.
       */
      const donationMinor = Math.max(0, Math.round(Number(meta.donationMinor ?? 0)));
      if (donationMinor > 0 && meta.donationOrganiserId && providerEventId) {
        try {
          await recordDonation({
            providerEventId: `${providerEventId}__gift`,
            organizerId: meta.donationOrganiserId,
            eventId: meta.eventId,
            userId: meta.userId,
            donorName: meta.attendeeName ?? 'Anonymous',
            donorEmail: meta.attendeeEmail ?? '',
            amountMinor: donationMinor,
            currency: (data.currency ?? 'USD').toUpperCase(),
            providerRef: data.intent_id,
          });
        } catch (error) {
          console.error('[koda] donation not recorded', {
            providerEventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Carried from the intent we created; tolerated when absent because older
      // intents (and any manual KODA dashboard test) never set them.
      const seats = (meta.seats ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      let mix: Array<{ typeId: string; typeName: string; price: number; quantity: number }> | undefined;
      if (meta.mix) {
        try {
          mix = JSON.parse(meta.mix);
        } catch {
          mix = undefined;
        }
      }

      try {
        const outcome = await recordPaymentEvent({
          providerEventId,
          provider: 'bitripay',
          providerType: payload.type,
          intent: 'issue',
          eventId: meta.eventId,
          tierId: meta.tierId,
          userId: meta.userId,
          quantity,
          // KODA's units differ by currency — whole francs for CDF, cents for USD
          // (see fromKodaAmount) — and the amount is the total, not a unit price.
          // Both conversions have to happen, and forgetting either produces a ticket
          // priced 100x wrong; the raw /100 that stood here did exactly that for CDF.
          // A gift riding the order is subtracted first: it is not ticket money, and
          // a refund must never return it as if it were.
          price: data.amount
            ? Math.max(
                0,
                fromKodaAmount(data.currency ?? 'CDF', data.amount) - donationMinor
              ) /
              100 /
              quantity
            : 0,
          currency: (data.currency ?? 'CDF').toUpperCase(),
          attendeeName: meta.attendeeName ?? 'Ticket holder',
          attendeeEmail: meta.attendeeEmail ?? '',
          providerRef: data.intent_id,
          ...(seats.length > 0 ? { seats } : {}),
          ...(meta.holdId ? { holdId: meta.holdId } : {}),
          ...(mix && mix.length > 0 ? { mix } : {}),
          // §16: the quote this order was made under, persisted for accounting.
          ...(Number(meta.pricingVersion ?? 0) > 0
            ? {
                feeSnapshot: {
                  pricingVersion: Number(meta.pricingVersion),
                  feeConfigVersion: meta.feeConfigVersion ?? '',
                  faceMinor: Number(meta.faceMinor ?? 0),
                  serviceFeeMinor: Number(meta.serviceFeeMinor ?? 0),
                  buyerTotalMinor: Number(meta.buyerTotalMinor ?? 0),
                },
              }
            : {}),
        });

        if (outcome === 'unavailable') {
          // 5xx so KODA retries. Acknowledging a payment whose ticket will never be
          // issued is the one outcome worth failing loudly to avoid.
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }

        return NextResponse.json({ received: true, queued: outcome });
      } catch (error) {
        console.error('[koda] failed to record payment event', {
          providerEventId,
          error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: 'record_failed' }, { status: 503 });
      }
    }

    case 'payment.rejected':
    case 'payment.expired':
      return NextResponse.json({ received: true });

    default:
      // Unknown types are acknowledged, not rejected. A 4xx makes KODA retry an event
      // we will never understand, forever.
      return NextResponse.json({ received: true, ignored: payload.type });
  }
}
