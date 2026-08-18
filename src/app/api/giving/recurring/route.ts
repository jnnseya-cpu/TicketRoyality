import { NextResponse } from 'next/server';

import {
  cancelRecurringDonation,
  createRecurringDonation,
  isStripeConfigured,
} from '@/backend/payments/stripe';
import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starting and stopping a standing monthly gift.
 *
 * A plain form POST answered with a 303, exactly like ticket checkout, so the redirect to
 * Stripe stays inside the user's click gesture — an async fetch then a location assignment
 * is blocked by the browser.
 *
 * Nothing is recorded here. The subscription exists at Stripe, and each month's gift is
 * recorded when `invoice.paid` arrives — including the first one. Recording the first
 * month here as well would double it, and a donor who is charged once but credited twice
 * is a discrepancy the charity finds at year end and cannot explain.
 */
export async function POST(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/checkout/cancel?reason=${encodeURIComponent(reason)}`, {
      status: 303,
    });

  if (!isStripeConfigured()) return fail('Stripe is not configured');

  const form = await request.formData();
  const organiserId = String(form.get('organiserId') ?? '');
  const amountMinor = Math.round(Number(form.get('amountMinor') ?? 0));
  const userId = String(form.get('userId') ?? '');

  if (!organiserId || amountMinor < 100) return fail('Choose an amount of £1 or more');

  // The charity's name comes from the stored organiser, never from the form: it appears
  // on the donor's card statement every month for as long as they give.
  let organiserName = 'this organiser';
  if (isAdminConfigured()) {
    try {
      const snap = await getAdminDb().collection('users').doc(organiserId).get();
      const data = snap.data();
      organiserName = String(data?.companyName ?? data?.fullName ?? organiserName);
    } catch (error) {
      reportError(error, { scope: 'giving.recurringName', organiserId });
    }
  }

  try {
    const url = await createRecurringDonation({
      amountMinor,
      currency: String(form.get('currency') ?? 'GBP'),
      organiserId,
      organiserName,
      userId,
      successUrl: `${siteUrl}/checkout/success?recurring=1`,
      cancelUrl: `${siteUrl}/checkout/cancel?reason=Monthly%20giving%20cancelled`,
    });
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    reportError(error, { scope: 'giving.recurringStart', organiserId });
    return fail('Could not start monthly giving');
  }
}

/**
 * Stopping.
 *
 * Immediate, and available to the donor without asking anybody — a standing gift somebody
 * cannot stop themselves is the thing that makes people refuse to start one.
 */
export async function DELETE(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const subscriptionId = new URL(request.url).searchParams.get('id') ?? '';
  if (!subscriptionId) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  /*
   * Ownership is checked against the gifts we have recorded under this subscription. The
   * subscription's own metadata carries a userId, but a donation row is the thing we can
   * prove belongs to this account — and cancelling somebody else's giving is not an
   * action to take on the strength of a query parameter.
   */
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 });
  }

  try {
    const mine = await getAdminDb()
      .collection('donations')
      .where('recurringId', '==', subscriptionId)
      .where('userId', '==', caller.uid)
      .limit(1)
      .get();

    if (mine.empty) {
      return NextResponse.json({ error: 'That is not your standing gift.' }, { status: 403 });
    }

    await cancelRecurringDonation(subscriptionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, { scope: 'giving.recurringStop', subscriptionId });
    return NextResponse.json({ error: 'Could not stop that gift.' }, { status: 503 });
  }
}
