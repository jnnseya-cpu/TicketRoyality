import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. Signature-verified and idempotent: replayed deliveries of the same
 * event id are acknowledged with 200 without issuing a second ticket.
 *
 * Ticket issuance itself needs privileged writes, so in production this handler should
 * use the Firebase Admin SDK with a service account. The client SDK cannot write a
 * ticket for another user without breaking the security rules — that is intentional.
 */
const processedEvents = new Set<string>();

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signature verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // TODO(admin-sdk): create the ticket document(s) for session.metadata.userId /
      // eventId / tierId, and mark the payment record as paid.
      console.info('[stripe] checkout completed', {
        sessionId: session.id,
        userId: session.metadata?.userId,
        eventId: session.metadata?.eventId,
        amountTotal: session.amount_total,
      });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      // TODO(admin-sdk): set the matching ticket status to 'refunded'.
      console.info('[stripe] charge refunded', { chargeId: charge.id });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
