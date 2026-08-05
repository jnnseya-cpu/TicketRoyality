import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe Checkout.
 *
 * This route responds with a 303 redirect rather than JSON, and the client posts to
 * it with a plain HTML <form>. That keeps the navigation inside the user's original
 * click gesture — an async fetch-then-redirect gets blocked by the browser with
 * "the current window does not have permission to navigate the target frame".
 */
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (!secretKey) {
    return NextResponse.redirect(
      `${siteUrl}/checkout/cancel?reason=${encodeURIComponent('Stripe is not configured')}`,
      { status: 303 }
    );
  }

  const stripe = new Stripe(secretKey);
  const form = await request.formData();

  // `items` is a JSON array for cart checkout; the single-event path sends flat fields.
  const rawItems = form.get('items');
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let currency = String(form.get('currency') ?? 'gbp').toLowerCase();

  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems) as Array<{
        eventTitle: string;
        tierName: string;
        price: number;
        quantity: number;
        currency: string;
      }>;
      if (parsed[0]) currency = parsed[0].currency.toLowerCase();
      for (const item of parsed) {
        lineItems.push({
          quantity: item.quantity,
          price_data: {
            currency,
            unit_amount: Math.round(item.price * 100),
            product_data: { name: `${item.eventTitle} — ${item.tierName}` },
          },
        });
      }
    } catch {
      return NextResponse.json({ error: 'Malformed items payload.' }, { status: 400 });
    }
  } else {
    const name = String(form.get('name') ?? 'Event ticket');
    const amount = Number(form.get('amount') ?? 0);
    const quantity = Number(form.get('quantity') ?? 1);
    lineItems.push({
      quantity,
      price_data: {
        currency,
        unit_amount: Math.round(amount * 100),
        product_data: { name },
      },
    });
  }

  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'Nothing to check out.' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel`,
      metadata: {
        userId: String(form.get('userId') ?? ''),
        eventId: String(form.get('eventId') ?? ''),
        tierId: String(form.get('tierId') ?? ''),
      },
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe checkout failed';
    return NextResponse.redirect(
      `${siteUrl}/checkout/cancel?reason=${encodeURIComponent(message)}`,
      { status: 303 }
    );
  }
}
