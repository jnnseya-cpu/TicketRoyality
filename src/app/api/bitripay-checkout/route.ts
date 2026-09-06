import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { isBitripayConfigured } from '@/backend/payments/bitripay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BitriPay checkout — deliberately neutralised, not a payment path.
 *
 * ## Why this refuses instead of charging
 *
 * The old body of this route took `amount`, `currency` and `reference` straight from the
 * client and created a payment for exactly that amount. That is **client-priced money**:
 * a crafted POST could pay a penny for a £200 ticket. It was harmless only because BitriPay
 * has no credentials — but it would have started taking the wrong amount, in the wrong
 * currency, the moment the keys were added (STATUS: "must be re-priced + token-gated before
 * BitriPay is ever enabled").
 *
 * It cannot be re-priced *in place*: its inputs do not even carry the quantity, the seats,
 * the attendee mix or a server-held reservation, so there is nothing for the server to price
 * against. The correct home for a BitriPay charge is the **same `/api/checkout` machinery
 * KODA already uses** — server-authoritative pricing from the stored tier, a Firestore hold,
 * a `cart_orders` record, and webhook-driven issuance. Until BitriPay is wired through that,
 * this endpoint takes no money.
 *
 * It still verifies the caller (closing the unauthenticated hole) and returns a clear,
 * honest status rather than a silent success, so the day someone enables BitriPay the
 * failure points at the real work rather than quietly mis-charging a buyer.
 */
export async function POST(request: Request) {
  // Auth first: the old route was unauthenticated. Even a disabled path must not be a
  // free, anonymous way to hit the payment provider.
  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  if (!isBitripayConfigured()) {
    return NextResponse.json({ error: 'Bitripay is not configured.' }, { status: 503 });
  }

  // Configured but deliberately not wired for real money yet. Never trust a client amount.
  return NextResponse.json(
    {
      error:
        'BitriPay checkout is not available. Pay by card or mobile money; BitriPay returns ' +
        'once it is wired through the server-priced checkout.',
    },
    { status: 501 }
  );
}
