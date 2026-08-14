import { NextResponse } from 'next/server';

import { verifyWebhook } from '@/backend/payments/koda';
import { recordPaymentEvent } from '@/backend/services/payment-events';

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
 *
 * As with Stripe, this handler verifies and records; issuance happens in the Cloud
 * Function triggered by the document it writes.
 */

/** The intent metadata we set at checkout and KODA echoes back. */
interface KodaMetadata {
  eventId?: string;
  tierId?: string;
  userId?: string;
  quantity?: string;
  attendeeName?: string;
  attendeeEmail?: string;
}

export async function POST(request: Request) {
  // Read the raw body first. Parsing and re-serialising changes key order and
  // whitespace, which breaks the HMAC every time.
  const raw = await request.text();
  const signature = request.headers.get('x-koda-signature');

  if (!verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: {
    id?: string;
    type?: string;
    data?: {
      intent_id?: string;
      receipt_id?: string;
      amount?: number;
      currency?: string;
      metadata?: KodaMetadata;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  switch (payload.type) {
    case 'payment.verified':
    case 'payment.verified.late': {
      const data = payload.data ?? {};
      const meta = data.metadata ?? {};

      // KODA's own event id keys idempotency. Falling back to the intent id is
      // deliberate: a late verification for the same intent must not issue a second
      // set of tickets, and the intent is what both deliveries have in common.
      const providerEventId = payload.id ?? data.intent_id;

      if (!providerEventId || !meta.eventId || !meta.tierId || !meta.userId) {
        console.error('[koda] verified payment missing metadata', {
          intentId: data.intent_id,
          type: payload.type,
        });
        // 202 rather than 200: acknowledged, but explicitly not issued, and KODA is
        // told the outcome rather than being left to assume success.
        return NextResponse.json(
          { received: true, issued: false, reason: 'missing_metadata' },
          { status: 202 }
        );
      }

      const quantity = Math.max(1, Number(meta.quantity ?? 1));

      try {
        const outcome = await recordPaymentEvent({
          providerEventId,
          provider: 'bitripay',
          providerType: payload.type,
          intent: 'issue',
          eventId: meta.eventId,
          tierId: meta.tierId,
          userId: meta.userId,
          quantity,
          // KODA amounts are minor units (docs/08 §8.3) and are the total, not a unit
          // price. Both conversions have to happen, and forgetting either produces a
          // ticket priced 100x wrong.
          price: data.amount ? data.amount / 100 / quantity : 0,
          currency: (data.currency ?? 'CDF').toUpperCase(),
          attendeeName: meta.attendeeName ?? 'Ticket holder',
          attendeeEmail: meta.attendeeEmail ?? '',
          providerRef: data.intent_id,
        });

        if (outcome === 'unavailable') {
          // 5xx so KODA retries. Acknowledging a payment whose ticket will never be
          // issued is the one outcome worth failing loudly to avoid.
          return NextResponse.json({ error: 'datastore_unavailable' }, { status: 503 });
        }

        return NextResponse.json({ received: true, queued: outcome });
      } catch (error) {
        console.error('[koda] failed to record payment event', {
          providerEventId,
          error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: 'record_failed' }, { status: 503 });
      }
    }

    case 'payment.rejected':
    case 'payment.expired':
      return NextResponse.json({ received: true });

    default:
      // Unknown types are acknowledged, not rejected. A 4xx makes KODA retry an event
      // we will never understand, forever.
      return NextResponse.json({ received: true, ignored: payload.type });
  }
}
