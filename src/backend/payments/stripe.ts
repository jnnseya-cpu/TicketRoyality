import 'server-only';

import Stripe from 'stripe';

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
    userId: session.metadata?.userId || undefined,
    eventId: session.metadata?.eventId || undefined,
    tierId: session.metadata?.tierId || undefined,
    quantity: Number(session.metadata?.quantity ?? 1),
    amountTotal: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'gbp').toUpperCase(),
    customerEmail: session.customer_details?.email ?? undefined,
    customerName: session.customer_details?.name ?? undefined,
  };
}
