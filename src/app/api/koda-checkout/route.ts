import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { createIntent, isKodaConfigured, KodaError, toKodaAmount } from '@/backend/payments/koda';
import { placeHold, releaseHold } from '@/backend/services/holds';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { resolveLinePrice, resolveMix, tierSaleWindow, type MixEntry } from '@/shared/pricing';
import type { TicketTier } from '@/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KODA mobile-money checkout — the sending half of an integration whose receiving half
 * (`/webhooks/koda`) was live first.
 *
 * The keys were in place and the webhook verified signatures, but nothing ever called
 * `createIntent`, so no buyer had ever seen KODA's interface: mobile money fell through
 * to the manual pay-to-this-number panel. This route closes that gap. The buyer is sent
 * to KODA's hosted checkout; KODA verifies the operator SMS reference against its SIM
 * ledger and fires the signed webhook, which is what actually issues the tickets —
 * exactly the Stripe division of labour.
 *
 * Priced here, server-side, by the one engine: standard service fee plus the 2%
 * mobile-money charge (CD config), never the browser's numbers. The organiser's face
 * value and the platform's fee both live inside the single amount KODA collects a
 * reference for. "We cannot lose money in any transaction."
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  if (!isKodaConfigured()) {
    return NextResponse.json({ error: 'Mobile money is not configured.' }, { status: 503 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }

  let body: {
    eventId?: string;
    tierId?: string;
    quantity?: number;
    seats?: string[];
    mix?: Array<{ typeId?: unknown; quantity?: unknown }>;
    accessCode?: string;
    /** A one-off gift riding the order, minor units. Recorded by the webhook with
        no platform fee, exactly as the Stripe rail treats it. */
    donationMinor?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');
  const tierId = String(body.tierId ?? '');
  if (!eventId || !tierId) {
    return NextResponse.json({ error: 'Missing event or ticket type.' }, { status: 400 });
  }

  const db = getAdminDb();
  const eventSnap = await db.collection('events').doc(eventId).get();
  const event = eventSnap.data() as
    | { title?: string; currency?: string; ticketTiers?: TicketTier[] }
    | undefined;
  const tier = event?.ticketTiers?.find((t) => t.id === tierId);
  if (!tier) return NextResponse.json({ error: 'That ticket type is not on sale.' }, { status: 404 });

  // KODA moves CDF and USD only. A GBP event cannot go down this rail, and pretending
  // otherwise would collect the wrong money in the wrong currency.
  const currency = String(event?.currency ?? 'USD').toUpperCase();
  if (currency !== 'USD' && currency !== 'CDF') {
    return NextResponse.json(
      { error: `Mobile money supports USD and CDF, not ${currency}.` },
      { status: 400 }
    );
  }

  const window = tierSaleWindow(tier);
  if (!window.onSale) {
    return NextResponse.json({ error: 'This ticket type is not on sale.' }, { status: 409 });
  }
  if (tier.visibility === 'hidden') {
    // The manual panel never sold hidden tiers and this route keeps that boundary;
    // hidden tiers go through the card path where the access code is already enforced.
    return NextResponse.json({ error: 'This ticket type needs the card checkout.' }, { status: 400 });
  }

  /* Price every line from the stored tier — the browser sends ids and counts only. */
  let mixEntries: MixEntry[] = [];
  let quantity = Math.max(1, Math.min(10, Number(body.quantity ?? 1)));
  let lines: Array<{ faceMinor: number; qty: number }>;

  if (Array.isArray(body.mix) && body.mix.length > 0) {
    const resolved = resolveMix(tier, body.mix);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
    mixEntries = resolved.entries;
    quantity = resolved.total;
    lines = resolved.entries.map((entry) => ({ faceMinor: toMinor(entry.price), qty: entry.quantity }));
  } else {
    const unit = resolveLinePrice(tier, undefined);
    lines = [{ faceMinor: toMinor(unit), qty: quantity }];
  }

  const quote = computeOrderFees(lines, { rail: 'bitripay_momo', countryCode: 'CD' });
  if (quote.buyerTotalMinor <= 0) {
    return NextResponse.json({ error: 'Free tickets are claimed, not paid.' }, { status: 400 });
  }

  /*
   * The gift, added AFTER the quote so it carries no platform fee — the same order of
   * operations as the card rail, for the same reason: charging a percentage of a
   * donation is indefensible. Only a one-off gift rides here; a MONTHLY gift is a
   * card subscription by nature (KODA has no pull payment) and stays on Stripe.
   */
  const donationMinor = Math.max(0, Math.round(Number(body.donationMinor ?? 0)));
  const organiserId = (eventSnap.data() as { organizerId?: string } | undefined)?.organizerId ?? '';

  const seats = (body.seats ?? []).map((seat) => String(seat).trim().toUpperCase()).filter(Boolean);
  if (seats.length > 0 && seats.length !== quantity) {
    return NextResponse.json({ error: 'Choose one seat for each ticket.' }, { status: 400 });
  }

  // Inventory reserved before anyone types an SMS code, same as before a card page.
  const hold = await placeHold(eventId, tierId, quantity, undefined, seats);
  if (!hold.ok) return NextResponse.json({ error: hold.error }, { status: 409 });

  const buyerSnap = await db.collection('users').doc(caller.uid).get();
  const buyer = buyerSnap.data() as { fullName?: string; email?: string } | undefined;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  try {
    const intent = await createIntent(
      {
        // KODA charges CDF in whole francs, not centimes — see toKodaAmount. Sending
        // our minor units raw asked a live buyer for 100× the displayed price.
        amount: toKodaAmount(currency, quote.buyerTotalMinor + donationMinor),
        currency,
        operators: ['mpesa_cd', 'airtel_cd', 'orange_cd', 'africell_cd'],
        // amt/cur feed the success page's conversion pixels only — never authority.
        successUrl: `${siteUrl}/checkout/success?provider=mobile-money&amt=${toMajor(quote.buyerTotalMinor + donationMinor)}&cur=${encodeURIComponent(currency)}`,
        // Echoed back on the webhook, which issues from it. Strings only.
        metadata: {
          eventId,
          tierId,
          userId: caller.uid,
          quantity: String(quantity),
          attendeeName: buyer?.fullName ?? 'Ticket holder',
          attendeeEmail: buyer?.email ?? '',
          holdId: hold.holdId,
          seats: seats.join(','),
          ...(mixEntries.length > 0 ? { mix: JSON.stringify(mixEntries) } : {}),
          // The gift, kept apart from the ticket money all the way to the record.
          ...(donationMinor > 0 && organiserId
            ? { donationMinor: String(donationMinor), donationOrganiserId: organiserId }
            : {}),
          // §16: the order keeps the pricing it was quoted under, forever.
          pricingVersion: String(quote.pricingVersion),
          feeConfigVersion: quote.configVersion,
          faceMinor: String(quote.faceMinor),
          serviceFeeMinor: String(quote.serviceFeeMinor),
          buyerTotalMinor: String(quote.buyerTotalMinor),
        },
      },
      // The hold id doubles as the idempotency key: a retried request reuses the same
      // intent instead of showing the buyer two payment panels for one order.
      hold.holdId
    );

    return NextResponse.json({ ok: true, url: intent.checkout_url });
  } catch (error) {
    // KODA never got them; the seats must not stay reserved on a dead checkout.
    await releaseHold(hold.holdId, 'abandoned');
    const status = error instanceof KodaError && error.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Mobile money is unavailable.' },
      { status }
    );
  }
}
