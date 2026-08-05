import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { isStripeConfigured, readCheckoutSession, verifyWebhook } from '@/backend/payments/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook — the authority for ticket issuance.
 *
 * A user who closes the tab the instant their card is charged must still receive their
 * ticket, so the redirect is never trusted; this handler is. It is signature-verified
 * and idempotent: replayed deliveries of the same event id are acknowledged with 200
 * and issue nothing further.
 */
const processedEvents = new Set<string>();

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

  // In-process guard. Production replaces this with an `issued_payments/{eventId}`
  // marker written in the same transaction as the tickets, so idempotency survives
  // a restart and holds across instances.
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);

  switch (event.type) {
    case 'checkout.session.completed': {
      const checkout = readCheckoutSession(event.data.object as Stripe.Checkout.Session);
      // Issuance needs the Admin SDK — see @/backend/services/ticket-issuance and
      // debt item D1 in docs/13. Logged here so the payload is observable meanwhile.
      console.info('[stripe] checkout.session.completed', checkout);
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      console.info('[stripe] charge.refunded', { chargeId: charge.id });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
