import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { exchangeSeats, moveSeat, quoteMove, quoteTierUpgrade } from '@/backend/services/seat-swap';
import { placeHold, releaseHold } from '@/backend/services/holds';
import { createCheckoutSession, isStripeConfigured } from '@/backend/payments/stripe';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changing where somebody sits, after they have paid.
 *
 * Every decision is made in `seat-swap.ts` inside a transaction — who may move this
 * ticket, whether the destination is on their tier, and whether anybody else got there
 * first. Nothing here is trusted from the body except the ids, and the person asking is
 * always the verified token rather than a field.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    action?: string;
    ticketId?: string;
    seat?: string;
    withTicketId?: string;
    toTierId?: string;
  };
  // 'quote' | 'upgrade' | 'tier-quote' | 'tier-upgrade' | 'exchange' | default free move
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  /*
   * A general-admission ticket moving to a dearer TYPE — the seatless twin of the
   * seat upgrade below. Same shape end to end: priced server-side from the stored
   * tier, inventory held while they pay, the move itself landing in the webhook
   * after the money. This closes the last "still a refund and a rebooking".
   */
  if (body.action === 'tier-quote' || body.action === 'tier-upgrade') {
    const ticketId = String(body.ticketId ?? '');
    const toTierId = String(body.toTierId ?? '');
    const quote = await quoteTierUpgrade(ticketId, toTierId, caller.uid);

    if (!quote.ok) {
      const status =
        quote.reason === 'not-yours'
          ? 403
          : quote.reason === 'no-ticket'
            ? 404
            : quote.reason === 'sold-out'
              ? 409
              : 400;
      return NextResponse.json({ error: quote.error, reason: quote.reason }, { status });
    }

    const fees = computeOrderFees([{ faceMinor: toMinor(quote.differenceMajor), qty: 1 }]);

    if (body.action === 'tier-quote') {
      return NextResponse.json({
        ok: true,
        toTierName: quote.toTierName,
        differenceMinor: toMinor(quote.differenceMajor),
        serviceFeeMinor: fees.serviceFeeMinor,
        totalMinor: fees.buyerTotalMinor,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Card payments are not configured.' }, { status: 503 });
    }
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }

    const ticketSnap = await getAdminDb().collection('tickets').doc(ticketId).get();
    const eventId = String(ticketSnap.data()?.eventId ?? '');
    const eventTitle = String(ticketSnap.data()?.eventTitle ?? 'Event');
    const currency = String(ticketSnap.data()?.currency ?? 'GBP');

    // A place on the dearer tier is reserved while they pay, so the last VIP ticket
    // cannot be sold twice — once at the door and once through this upgrade.
    const hold = await placeHold(eventId, quote.toTierId, 1);
    if (!hold.ok) return NextResponse.json({ error: hold.error }, { status: 409 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
    try {
      const url = await createCheckoutSession({
        lines: [
          {
            name: `${eventTitle} — upgrade to ${quote.toTierName}`,
            amount: quote.differenceMajor,
            quantity: 1,
            currency,
          },
          ...(fees.serviceFeeMinor > 0
            ? [
                {
                  name: 'TicketRoyality Service Fee',
                  amount: toMajor(fees.serviceFeeMinor),
                  quantity: 1,
                  currency,
                },
              ]
            : []),
        ],
        successUrl: `${siteUrl}/dashboard/customer?upgraded=1`,
        cancelUrl: `${siteUrl}/dashboard/customer`,
        // No upgradeToSeat: that absence is what routes the webhook to the tier path.
        metadata: {
          userId: caller.uid,
          upgradeTicketId: ticketId,
          upgradeToTierId: quote.toTierId,
          upgradeDiff: String(quote.differenceMajor),
          holdId: hold.holdId,
        },
      });
      return NextResponse.json({ ok: true, url });
    } catch (error) {
      // Stripe never got them; the reserved place must not stay held on a dead checkout.
      await releaseHold(hold.holdId, 'abandoned');
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Checkout failed.' },
        { status: 502 }
      );
    }
  }

  /*
   * A move into a dearer tier is a purchase, not a favour — docs/24 §14. `quote` prices
   * it server-side (difference plus the buyer service fee on that difference, same
   * engine as every other price on the platform); `upgrade` holds the seat and sends
   * the buyer to Stripe for exactly that amount. The move itself lands in the webhook,
   * after the money — never before.
   */
  if (body.action === 'quote' || body.action === 'upgrade') {
    const ticketId = String(body.ticketId ?? '');
    const seat = String(body.seat ?? '');
    const quote = await quoteMove(ticketId, seat, caller.uid);

    if (!quote.ok) {
      const status =
        quote.reason === 'not-yours' ? 403 : quote.reason === 'no-ticket' ? 404 : 400;
      return NextResponse.json({ error: quote.error, reason: quote.reason }, { status });
    }

    if (!quote.upgrade) {
      // Same tier — the free path already covers it; tell the client to use it.
      return NextResponse.json({ ok: true, upgrade: false });
    }

    const fees = computeOrderFees([{ faceMinor: toMinor(quote.differenceMajor), qty: 1 }]);
    const totalMinor = fees.buyerTotalMinor;

    if (body.action === 'quote') {
      return NextResponse.json({
        ok: true,
        upgrade: true,
        toTierName: quote.toTierName,
        differenceMinor: toMinor(quote.differenceMajor),
        serviceFeeMinor: fees.serviceFeeMinor,
        totalMinor,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Card payments are not configured.' }, { status: 503 });
    }
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }

    const ticketSnap = await getAdminDb().collection('tickets').doc(ticketId).get();
    const eventId = String(ticketSnap.data()?.eventId ?? '');
    const eventTitle = String(ticketSnap.data()?.eventTitle ?? 'Event');
    const currency = String(ticketSnap.data()?.currency ?? 'GBP');

    // The seat is held while they pay, so two upgraders cannot buy one chair.
    const hold = await placeHold(eventId, quote.toTierId, 1, undefined, [seat]);
    if (!hold.ok) return NextResponse.json({ error: hold.error }, { status: 409 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
    try {
      const lines = [
        {
          name: `${eventTitle} — seat upgrade to ${seat} (${quote.toTierName})`,
          amount: quote.differenceMajor,
          quantity: 1,
          currency,
        },
        ...(fees.serviceFeeMinor > 0
          ? [
              {
                name: 'TicketRoyality Service Fee',
                amount: toMajor(fees.serviceFeeMinor),
                quantity: 1,
                currency,
              },
            ]
          : []),
      ];

      const url = await createCheckoutSession({
        lines,
        successUrl: `${siteUrl}/dashboard/customer?upgraded=1`,
        cancelUrl: `${siteUrl}/dashboard/customer`,
        metadata: {
          userId: caller.uid,
          upgradeTicketId: ticketId,
          upgradeToSeat: seat.trim().toUpperCase(),
          upgradeToTierId: quote.toTierId,
          upgradeDiff: String(quote.differenceMajor),
          holdId: hold.holdId,
        },
      });
      return NextResponse.json({ ok: true, upgrade: true, url });
    } catch (error) {
      // Stripe never got them; the seat must not stay reserved on a dead checkout.
      await releaseHold(hold.holdId, 'abandoned');
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Checkout failed.' },
        { status: 502 }
      );
    }
  }

  const result =
    body.action === 'exchange'
      ? await exchangeSeats(String(body.ticketId ?? ''), String(body.withTicketId ?? ''), caller.uid)
      : await moveSeat(String(body.ticketId ?? ''), String(body.seat ?? ''), caller.uid);

  if (result.ok) return NextResponse.json(result);

  /*
   * "Taken" is a 409 rather than a 400: nothing about the request was wrong, somebody
   * else simply got there first, and the difference matters to anything retrying.
   */
  const status =
    result.reason === 'not-yours'
      ? 403
      : result.reason === 'no-ticket'
        ? 404
        : result.reason === 'seat-taken'
          ? 409
          : result.reason === 'unavailable'
            ? 503
            : 400;

  return NextResponse.json({ error: result.error, reason: result.reason }, { status });
}
