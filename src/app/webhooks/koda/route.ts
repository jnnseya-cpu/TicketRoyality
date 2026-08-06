import { NextResponse } from 'next/server';

import { verifyWebhook } from '@/backend/payments/koda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KODA payment verification webhook — https://ticketroyality.com/webhooks/koda
 *
 * The path is registered with KODA and must not change without re-registering there
 * first. A moved webhook URL is silent: KODA keeps posting to the old path, gets a
 * 404, retries for 24 hours and gives up, and the first symptom is a customer saying
 * they paid and got nothing.
 *
 * This is the source of truth for a direct mobile-money payment, not the browser
 * redirect (docs/20 §20.6). A customer whose signal drops the instant their code is
 * accepted still gets their ticket.
 */
export async function POST(request: Request) {
  // Read the raw body first. Parsing and re-serialising changes key order and
  // whitespace, which breaks the HMAC every time.
  const raw = await request.text();
  const signature = request.headers.get('x-koda-signature');

  if (!verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  switch (payload.type) {
    case 'payment.verified':
    case 'payment.verified.late':
      // TODO(D1): issue tickets via the Cloud Function. Until that lands the event is
      // acknowledged and left in the admin queue rather than silently dropped —
      // returning 200 here without acting would tell KODA to stop retrying.
      return NextResponse.json(
        { received: true, issued: false, reason: 'issuance_pending' },
        { status: 202 }
      );

    case 'payment.rejected':
    case 'payment.expired':
      return NextResponse.json({ received: true });

    default:
      // Unknown types are acknowledged, not rejected. A 4xx makes KODA retry an event
      // we will never understand, forever.
      return NextResponse.json({ received: true, ignored: payload.type });
  }
}
