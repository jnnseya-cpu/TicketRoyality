import 'server-only';

import Stripe from 'stripe';

import { decodeCart } from '@/shared/cart-metadata';

/**
 * Stripe adapter. Server-only — the secret key must never reach a client bundle.
 * Route handlers stay thin and call into here; all Stripe knowledge lives in this file
 * so swapping or adding a processor touches one module.
 */

export interface CheckoutLine {
  name: string;
  amount: number; // major units, converted to minor here
  quantity: number;
  currency: string;
}

export interface CheckoutRequest {
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function client() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  return new Stripe(key);
}

/**
 * Creates a Checkout Session and returns its hosted URL.
 *
 * The caller responds with a 303 redirect to this URL rather than returning JSON for
 * the browser to follow. That keeps the navigation inside the user's original click
 * gesture — an async fetch-then-assign is blocked with "the current window does not
 * have permission to navigate the target frame".
 */
export async function createCheckoutSession(request: CheckoutRequest): Promise<string> {
  const stripe = client();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = request.lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: line.currency.toLowerCase(),
      unit_amount: Math.round(line.amount * 100),
      product_data: { name: line.name },
    },
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    metadata: request.metadata,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return session.url;
}

/**
 * A standing monthly gift.
 *
 * ## Why this is a different function rather than a flag
 *
 * A subscription is not a purchase with `mode` set differently. Nothing is issued, no
 * inventory is held, no hold is consumed, and the money arrives every month from an
 * invoice rather than once from a session — a different event, a different idempotency
 * key, a different record. Folding it into `createCheckoutSession` would mean every
 * ticket sale carrying branches for a thing it never does.
 *
 * The customer's email is collected by Stripe and comes back on the invoice, which is
 * what ties each month's gift to the donor's Gift Aid declaration.
 */
export async function createRecurringDonation(request: {
  amountMinor: number;
  currency: string;
  organiserId: string;
  organiserName: string;
  successUrl: string;
  cancelUrl: string;
  userId?: string;
}): Promise<string> {
  const stripe = client();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: request.currency.toLowerCase(),
          unit_amount: Math.round(request.amountMinor),
          recurring: { interval: 'month' },
          product_data: { name: `Monthly donation — ${request.organiserName}` },
        },
      },
    ],
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    /*
     * Copied onto the subscription itself, not just this checkout. Every future invoice
     * carries it, which is the only way month eleven knows which charity it belongs to —
     * the checkout session that started it is long gone by then.
     */
    subscription_data: {
      metadata: {
        donationOrganiserId: request.organiserId,
        userId: request.userId ?? '',
      },
    },
    metadata: {
      donationOrganiserId: request.organiserId,
      userId: request.userId ?? '',
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return session.url;
}

/** Stop a standing gift. The donor's own decision, so it takes effect immediately. */
/**
 * Refund one payment in full — the event-cancellation path.
 *
 * Idempotent by key: cancelling an event twice (a retry, a double tap, a second
 * admin) must never refund the same buyer twice. The refund itself is only half the
 * story — Stripe answers with `charge.refunded`, and THAT webhook is what invalidates
 * the tickets, exactly as a refund made from the Stripe dashboard always has. This
 * function moves money; the existing loop keeps the records honest.
 */
export async function refundPaymentIntent(
  paymentIntentId: string,
  idempotencyKey: string
): Promise<void> {
  await client().refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey });
}

export async function cancelRecurringDonation(subscriptionId: string): Promise<void> {
  await client().subscriptions.cancel(subscriptionId);
}

/** The subscription behind an invoice, and who it belongs to. */
export async function readSubscription(subscriptionId: string) {
  const subscription = await client().subscriptions.retrieve(subscriptionId);
  return {
    id: subscription.id,
    organiserId: subscription.metadata?.donationOrganiserId || undefined,
    userId: subscription.metadata?.userId || undefined,
    status: subscription.status,
  };
}

/**
 * Verifies a webhook signature and returns the parsed event.
 * Throws on any tampering — the caller must respond 400 and must not process it.
 */
export function verifyWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  return client().webhooks.constructEvent(rawBody, signature, secret);
}

/** Normalises a completed checkout into the fields ticket issuance needs. */
export function readCheckoutSession(session: Stripe.Checkout.Session) {
  return {
    sessionId: session.id,
    /**
     * The payment intent id, which is the only identifier shared between a checkout
     * session and the `charge.refunded` event that later reverses it. Without it a
     * refund cannot find the tickets it is meant to invalidate.
     */
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined),
    userId: session.metadata?.userId || undefined,
    eventId: session.metadata?.eventId || undefined,
    tierId: session.metadata?.tierId || undefined,
    quantity: Number(session.metadata?.quantity ?? 1),
    holdId: session.metadata?.holdId || undefined,
    /** Set when this payment buys a seat upgrade rather than tickets — docs/24 §14. */
    upgradeTicketId: session.metadata?.upgradeTicketId || undefined,
    upgradeToSeat: session.metadata?.upgradeToSeat || undefined,
    upgradeToTierId: session.metadata?.upgradeToTierId || undefined,
    upgradeDiff: Number(session.metadata?.upgradeDiff ?? 0),
    /**
     * The attendee-type breakdown, JSON in metadata because Stripe metadata is strings.
     * Parsed defensively: malformed metadata degrades to a single-price order rather
     * than losing the payment — the money has already moved by the time this is read.
     */
    mix: (() => {
      try {
        const parsed = JSON.parse(session.metadata?.mix ?? 'null');
        return Array.isArray(parsed) && parsed.length > 0
          ? (parsed as Array<{ typeId: string; typeName: string; price: number; quantity: number }>)
          : undefined;
      } catch {
        return undefined;
      }
    })(),
    /**
     * The priced basket, one entry per cart line — the multi-event path. Decoded
     * defensively for the same reason as `mix`: the money has already moved, so
     * malformed metadata degrades to an empty list the webhook logs loudly rather
     * than a parse error that loses the payment.
     */
    cart: decodeCart(session.metadata?.cart),
    /**
     * The basket's order document id — the successor to the inline `cart` encoding,
     * because seats and attendee mixes do not fit a 500-character metadata value.
     * The webhook reads `cart_orders/{id}` and issues each line.
     */
    cartOrderId: session.metadata?.cartOrderId || undefined,
    /** Set when this payment buys a homepage/newsletter placement, not tickets. */
    promoPlacement: session.metadata?.promoPlacement || undefined,
    promoEventId: session.metadata?.promoEventId || undefined,
    /** Set when the payment is a hospitality deposit or balance rather than a ticket sale. */
    bookingId: session.metadata?.bookingId || undefined,
    /** Set on a season pass, which settles into one ticket per covered fixture. */
    passId: session.metadata?.passId || undefined,
    /**
     * A gift travelling alongside the tickets, in minor units.
     *
     * Separate from the ticket price for a reason that is not presentational: Gift Aid is
     * claimed on a gift and never on a payment for admission, so the two must be distinct
     * amounts from the moment the money lands.
     */
    donationMinor: Number(session.metadata?.donationMinor ?? 0),
    /** The charity the gift belongs to — the organiser of the event it was given at. */
    donationOrganiserId: session.metadata?.donationOrganiserId || undefined,
    /**
     * A gift registry contribution — a present for a person, not a gift to a charity.
     * No Gift Aid, and it never reaches the donation collection.
     */
    registryItemId: session.metadata?.registryItemId || undefined,
    registryMinor: Number(session.metadata?.registryMinor ?? 0),
    registryMessage: session.metadata?.registryMessage || undefined,
    /** The partner link that sent this buyer, if any. */
    ref: session.metadata?.ref || undefined,
    /**
     * Face value of the order in minor units, as quoted at checkout.
     *
     * Partner commission is owed on what the tickets were worth, not on the total the
     * buyer paid — that carries our service fee, and paying a partner a percentage of
     * our fee is not what anybody agreed to.
     */
    faceMinor: Number(session.metadata?.faceMinor ?? 0),
    /** Chosen seats, in the order the tickets should carry them. */
    seats: (session.metadata?.seats || '')
      .split(',')
      .map((seat) => seat.trim())
      .filter(Boolean),
    amountTotal: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'gbp').toUpperCase(),
    customerEmail: session.customer_details?.email ?? undefined,
    customerName: session.customer_details?.name ?? undefined,
  };
}
