import { NextResponse } from 'next/server';

import { createPayment, isBitripayConfigured } from '@/backend/payments/bitripay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bitripay checkout. Thin: validates input and delegates to the adapter, which owns
 * the token exchange and the payment-creation call.
 */
export async function POST(request: Request) {
  if (!isBitripayConfigured()) {
    return NextResponse.json({ error: 'Bitripay is not configured.' }, { status: 503 });
  }

  let body: { amount?: number; currency?: string; reference?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'amount must be a positive number', received: body.amount },
      { status: 400 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  try {
    const result = await createPayment({
      amount,
      currency: body.currency ?? 'USD',
      reference: body.reference ?? '',
      returnUrl: `${siteUrl}/checkout/success?provider=bitripay`,
      cancelUrl: `${siteUrl}/checkout/cancel?provider=bitripay`,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bitripay checkout failed' },
      { status: 502 }
    );
  }
}
