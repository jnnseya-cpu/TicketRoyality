import { NextResponse } from 'next/server';

import { createCheckoutSession, isStripeConfigured } from '@/backend/payments/stripe';
import { amountDueMinor, getBooking } from '@/backend/services/hospitality';
import { toMajor } from '@/shared/fees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pay a deposit, or settle a balance.
 *
 * Responds with a 303 to Stripe, driven by a plain HTML form, for the same reason ticket
 * checkout does: the navigation has to stay inside the user's original click gesture or
 * the browser blocks it.
 *
 * ## The amount is never posted
 *
 * The form carries a booking id and nothing else that matters. What is owed is read from
 * the stored booking — the deposit until it has been paid, then whatever is left — so a
 * hand-crafted POST cannot settle a £4,000 table for a pound. This is the same discipline
 * that closed the same hole on ticket checkout.
 *
 * The booking id is not treated as a secret, and does not need to be: everything this
 * route can do is *pay somebody's table*, and the tickets go to the buyer on the booking
 * either way. Cancelling, editing guests and reading a booking all require a verified
 * token and go through `/api/hospitality`.
 */
export async function POST(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/checkout/cancel?reason=${encodeURIComponent(reason)}`, {
      status: 303,
    });

  if (!isStripeConfigured()) return fail('Stripe is not configured');

  const form = await request.formData();
  const bookingId = String(form.get('bookingId') ?? '');
  if (!bookingId) return fail('No booking to pay for');

  const booking = await getBooking(bookingId);
  if (!booking) return fail('That booking no longer exists');
  if (booking.status === 'cancelled' || booking.status === 'expired') {
    return fail(`That booking was ${booking.status}`);
  }

  const dueMinor = amountDueMinor(booking);
  if (dueMinor <= 0) return fail('That booking is already paid in full');

  const isDeposit = booking.paidMinor <= 0 && booking.depositMinor < booking.totalMinor;
  const label = isDeposit
    ? `${booking.packageName ?? 'Table'} — deposit`
    : `${booking.packageName ?? 'Table'} — ${booking.paidMinor > 0 ? 'balance' : 'payment in full'}`;

  try {
    const url = await createCheckoutSession({
      lines: [
        {
          // One line, already all-in: the booking total came from the pricing engine when
          // the table was reserved, service fee included. Adding a fee here would charge
          // it twice.
          name: `${booking.eventTitle || 'Event'} — ${label}`,
          amount: toMajor(dueMinor),
          quantity: 1,
          currency: booking.currency ?? 'GBP',
        },
      ],
      successUrl: `${siteUrl}/dashboard/customer/bookings?paid=${bookingId}`,
      cancelUrl: `${siteUrl}/dashboard/customer/bookings`,
      // The webhook records this against the booking and, when it closes the balance,
      // hands issuance to the path that already issues every other ticket.
      metadata: { bookingId },
    });
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Stripe checkout failed');
  }
}
