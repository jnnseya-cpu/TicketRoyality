import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bitripay checkout. Two server-to-server calls:
 *   1. POST /authentication/token  -> short-lived access token
 *   2. POST /payment/create        -> hosted payment_url
 *
 * Credentials never leave the server.
 */
export async function POST(request: Request) {
  const baseUrl = process.env.BITRIPAY_BASE_URL ?? 'https://bitripay.com/pay/sandbox/api/v1';
  const clientId = process.env.BITRIPAY_CLIENT_ID;
  const secretId = process.env.BITRIPAY_SECRET_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (!clientId || !secretId) {
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
    return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
  }

  try {
    const tokenResponse = await fetch(`${baseUrl}/authentication/token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret_id: secretId }),
    });
    const tokenJson = (await tokenResponse.json()) as {
      data?: { access_token?: string };
      message?: { error?: string[] };
    };
    const accessToken = tokenJson.data?.access_token;
    if (!accessToken) {
      throw new Error(tokenJson.message?.error?.[0] ?? 'Bitripay authentication failed.');
    }

    const paymentResponse = await fetch(`${baseUrl}/payment/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount.toFixed(2),
        currency: body.currency ?? 'USD',
        return_url: `${siteUrl}/checkout/success?provider=bitripay`,
        cancel_url: `${siteUrl}/checkout/cancel?provider=bitripay`,
        custom: body.reference ?? '',
      }),
    });
    const paymentJson = (await paymentResponse.json()) as {
      data?: { payment_url?: string; token?: string };
      message?: { error?: string[] };
    };

    const paymentUrl = paymentJson.data?.payment_url;
    if (!paymentUrl) {
      throw new Error(paymentJson.message?.error?.[0] ?? 'Bitripay did not return a payment URL.');
    }

    return NextResponse.json({ paymentUrl, token: paymentJson.data?.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bitripay checkout failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
