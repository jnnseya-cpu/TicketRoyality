import { NextResponse } from 'next/server';

import { createCheckoutSession, isStripeConfigured, type CheckoutLine } from '@/backend/payments/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe checkout entry point.
 *
 * Responds with a 303 redirect rather than JSON, and the client posts to it with a
 * plain HTML <form>. That keeps the navigation inside the user's original click
 * gesture — an async fetch-then-redirect gets blocked by the browser with "the current
 * window does not have permission to navigate the target frame".
 *
 * This handler only parses and routes; all Stripe knowledge lives in
 * `@/backend/payments/stripe`.
 */
export async function POST(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/checkout/cancel?reason=${encodeURIComponent(reason)}`, {
      status: 303,
    });

  if (!isStripeConfigured()) return fail('Stripe is not configured');

  const form = await request.formData();
  const lines: CheckoutLine[] = [];

  // `items` is a JSON array for cart checkout; single-event checkout sends flat fields.
  const rawItems = form.get('items');
  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems) as Array<{
        eventTitle: string;
        tierName: string;
        price: number;
        quantity: number;
        currency: string;
      }>;
      for (const item of parsed) {
        lines.push({
          name: `${item.eventTitle} — ${item.tierName}`,
          amount: item.price,
          quantity: item.quantity,
          currency: item.currency,
        });
      }
    } catch {
      return NextResponse.json({ error: 'Malformed items payload.' }, { status: 400 });
    }
  } else {
    lines.push({
      name: String(form.get('name') ?? 'Event ticket'),
      amount: Number(form.get('amount') ?? 0),
      quantity: Number(form.get('quantity') ?? 1),
      currency: String(form.get('currency') ?? 'GBP'),
    });
  }

  if (lines.length === 0) return NextResponse.json({ error: 'Nothing to check out.' }, { status: 400 });

  try {
    const url = await createCheckoutSession({
      lines,
      successUrl: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/checkout/cancel`,
      // Carried through to the webhook, which is what actually issues the tickets.
      metadata: {
        userId: String(form.get('userId') ?? ''),
        eventId: String(form.get('eventId') ?? ''),
        tierId: String(form.get('tierId') ?? ''),
        quantity: String(form.get('quantity') ?? '1'),
      },
    });
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Stripe checkout failed');
  }
}
