import { NextResponse } from 'next/server';

import { createCheckoutSession, isStripeConfigured, type CheckoutLine } from '@/backend/payments/stripe';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import type { TicketTier } from '@/shared/types';

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
 * This handler parses, **prices**, and routes; all Stripe knowledge lives in
 * `@/backend/payments/stripe`.
 *
 * ## The buyer pays the all-in total, computed here
 *
 * The service fee is added server-side, from `shared/fees.ts`, and appears as one
 * "TicketRoyality Service Fee" line on the Stripe session. It is never taken from the
 * form: a fee the browser could post is a fee the browser could set to zero.
 *
 * ## Face value is re-read from Firestore where possible
 *
 * The single-event path posts `eventId` and `tierId`, so the tier's real price is looked
 * up and the posted `amount` is ignored. That closes a hole that predates this change —
 * the form previously named its own price, and a hand-crafted POST could have bought a
 * £250 ticket for a penny. The cart path still trusts its posted amounts and is flagged
 * in STATUS.md; it needs a per-item lookup that is a larger change than this one.
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
    const eventId = String(form.get('eventId') ?? '');
    const tierId = String(form.get('tierId') ?? '');
    const quantity = Math.max(1, Math.min(10, Number(form.get('quantity') ?? 1)));

    // The authoritative price. Only falls back to the posted amount when the Admin SDK
    // is unavailable, which is a deployment fault rather than a normal path.
    let amount = Number(form.get('amount') ?? 0);
    let name = String(form.get('name') ?? 'Event ticket');
    let currency = String(form.get('currency') ?? 'GBP');

    if (isAdminConfigured() && eventId && tierId) {
      try {
        const doc = await getAdminDb().collection('events').doc(eventId).get();
        const data = doc.data() as
          | { title?: string; currency?: string; ticketTiers?: TicketTier[] }
          | undefined;
        const tier = data?.ticketTiers?.find((t) => t.id === tierId);
        if (!tier) return fail('That ticket type is no longer on sale');
        amount = tier.price;
        name = `${data?.title ?? 'Event'} — ${tier.name}`;
        currency = data?.currency ?? currency;
      } catch {
        return fail('Could not confirm the ticket price');
      }
    }

    lines.push({ name, amount, quantity, currency });
  }

  if (lines.length === 0) return NextResponse.json({ error: 'Nothing to check out.' }, { status: 400 });

  /*
   * The service fee, as its own Stripe line so the buyer's receipt itemises what the
   * event page already showed them. One line for the whole order — the engine computes
   * it per paid ticket and sums, which is why this is a single quantity-1 line rather
   * than a per-ticket charge Stripe would round differently.
   */
  const quote = computeOrderFees(
    lines.map((line) => ({ faceMinor: toMinor(line.amount), qty: line.quantity }))
  );

  if (quote.serviceFeeMinor > 0) {
    lines.push({
      name: 'TicketRoyality Service Fee',
      amount: toMajor(quote.serviceFeeMinor),
      quantity: 1,
      currency: lines[0].currency,
    });
  }

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
        // §16: the order keeps the pricing it was quoted under, forever. A historical
        // order must never be recomputed from whatever the config says later.
        pricingVersion: String(quote.pricingVersion),
        feeConfigVersion: quote.configVersion,
        faceMinor: String(quote.faceMinor),
        serviceFeeMinor: String(quote.serviceFeeMinor),
        buyerTotalMinor: String(quote.buyerTotalMinor),
        organiserPayoutMinor: String(quote.organiserPayoutMinor),
      },
    });
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Stripe checkout failed');
  }
}
