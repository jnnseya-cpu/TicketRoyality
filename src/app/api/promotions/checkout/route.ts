import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { createCheckoutSession, isStripeConfigured } from '@/backend/payments/stripe';
import { createIntent, isKodaConfigured, toKodaAmount } from '@/backend/payments/koda';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { placementPricing } from '@/backend/services/promotions';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Buying a placement — self-serve, live the moment the payment lands.
 *
 * This replaces the enquiry flow on the owner's direction: the organiser pays the
 * catalogue price by card and the Stripe webhook activates the placement. The price
 * comes from `shared/placements.ts`, never from the request — the first version of
 * placement sales trusted a posted amount and charged £249 for a slot that did not
 * exist; both halves of that failure are dead (prices are server-side, and the strip,
 * grid and newsletter block are all real surfaces now).
 *
 * Only the event's own organiser can promote it, and only a published event can be
 * promoted — paying to put a draft on the homepage would advertise a page nobody
 * can open.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  }

  let body: { placementId?: unknown; eventId?: unknown; rail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  // 'card' (Stripe, GBP) or 'momo' (KODA, USD) — the owner's requirement that both
  // rails sell placements. Prices come from the dashboard-editable catalogue.
  const rail = body.rail === 'momo' ? 'momo' : 'card';
  const pricing = await placementPricing();
  const placement = Object.prototype.hasOwnProperty.call(pricing, String(body.placementId ?? ''))
    ? pricing[String(body.placementId) as keyof typeof pricing]
    : null;
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!placement) {
    return NextResponse.json({ error: 'That placement does not exist.' }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: 'Choose an event to promote.' }, { status: 400 });
  }

  let eventTitle = '';
  try {
    const snap = await getAdminDb().collection('events').doc(eventId).get();
    const data = snap.data() as
      | { title?: string; organizerId?: string; status?: string; date?: string }
      | undefined;

    if (!data) {
      return NextResponse.json({ error: 'That event no longer exists.' }, { status: 404 });
    }
    // Promoting somebody else's event is not a purchase anyone offers.
    if (data.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'You can only promote your own events.' }, { status: 403 });
    }
    if (data.status !== 'published') {
      return NextResponse.json(
        { error: 'Publish the event first — a placement links to its public page.' },
        { status: 400 }
      );
    }
    if (data.date && new Date(data.date).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'That event has already happened — there is nothing left to promote.' },
        { status: 400 }
      );
    }
    eventTitle = data.title ?? 'your event';
  } catch (error) {
    reportError(error, { scope: 'promotions/checkout', uid: caller.uid });
    return NextResponse.json({ error: 'Could not confirm the event.' }, { status: 502 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  /*
   * Mobile money — the KODA rail, in USD because KODA moves USD and CDF only. The
   * webhook `/webhooks/koda` activates from the same metadata pair the Stripe branch
   * carries, so both rails land in one `activatePlacement`.
   */
  if (rail === 'momo') {
    if (!isKodaConfigured()) {
      return NextResponse.json(
        { error: 'Mobile money is temporarily unavailable — pay by card.' },
        { status: 503 }
      );
    }
    try {
      const intent = await createIntent(
        {
          amount: toKodaAmount('USD', Math.round(placement.priceUsdMajor * 100)),
          currency: 'USD',
          operators: ['mpesa_cd', 'airtel_cd', 'orange_cd', 'africell_cd'],
          successUrl: `${siteUrl}/dashboard/organiser/promotions?placement=live`,
          metadata: {
            promoPlacement: placement.id,
            promoEventId: eventId,
            userId: caller.uid,
          },
        },
        // One intent per placement+event+buyer at a time: a double-click reuses the
        // panel instead of opening two. A later re-purchase (after expiry) is a new
        // decision KODA sees as the same key — the daily suffix keeps renewals apart.
        `promo_${placement.id}_${eventId}_${caller.uid}_${new Date().toISOString().slice(0, 10)}`
      );
      return NextResponse.json({ url: intent.checkout_url });
    } catch (error) {
      reportError(error, { scope: 'promotions/checkout-koda', uid: caller.uid });
      return NextResponse.json(
        { error: 'Mobile money could not be started — pay by card.' },
        { status: 502 }
      );
    }
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Card payments are not configured.' }, { status: 503 });
  }

  try {
    const url = await createCheckoutSession({
      lines: [
        {
          name: `${placement.title} — ${eventTitle} (${placement.periodLabel})`,
          amount: placement.priceMajor,
          quantity: 1,
          currency: placement.currency,
        },
      ],
      successUrl: `${siteUrl}/dashboard/organiser/promotions?placement=live`,
      cancelUrl: `${siteUrl}/dashboard/organiser/promotions`,
      metadata: {
        userId: caller.uid,
        // The webhook branches on this pair; everything else it needs is in the
        // catalogue, which is the same table this route priced from.
        promoPlacement: placement.id,
        promoEventId: eventId,
      },
    });
    return NextResponse.json({ url });
  } catch (error) {
    reportError(error, { scope: 'promotions/checkout', uid: caller.uid });
    return NextResponse.json({ error: 'Stripe checkout could not be started.' }, { status: 502 });
  }
}
