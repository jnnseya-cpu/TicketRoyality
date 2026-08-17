'use client';

import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';

/**
 * What the organiser keeps, and what the fan will see — shown while they type the price.
 *
 * The organiser is entering a number that means two different things to two different
 * people, and getting that wrong is the most expensive misunderstanding in ticketing.
 * Every platform they have used before deducted a commission from this figure, so the
 * default assumption is that £50 becomes £47 in their pocket. Here it does not, and the
 * only way to make that land is to show the arithmetic at the moment they type it.
 *
 * The fan-facing figure matters just as much in the other direction: an organiser who
 * does not know the buyer sees £52.49 will price against a competitor's face value and
 * be surprised by their own listing.
 */
export function TierEconomics({ price, currency }: { price: number; currency: string }) {
  const faceMinor = toMinor(Number.isFinite(price) ? price : 0);

  if (faceMinor <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Free tickets cost you nothing and cost the guest nothing. No commission, no
        service fee, no card charge.
      </p>
    );
  }

  const quote = computeOrderFees([{ faceMinor, qty: 1 }]);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Ticket value</dt>
      <dd className="text-right tabular-nums">{formatCurrency(toMajor(faceMinor), currency)}</dd>

      <dt className="text-muted-foreground">Your commission</dt>
      <dd className="text-right tabular-nums text-primary">0%</dd>

      <dt className="font-medium">You receive</dt>
      <dd className="text-right font-medium tabular-nums">
        {formatCurrency(toMajor(quote.organiserPayoutMinor), currency)}
      </dd>

      <dt className="col-span-2 border-t border-border/70 pt-1" />

      <dt className="text-muted-foreground">Fan service fee</dt>
      <dd className="text-right tabular-nums">
        {formatCurrency(toMajor(quote.serviceFeeMinor), currency)}
      </dd>

      <dt className="text-muted-foreground">Price shown to the fan</dt>
      <dd className="text-right tabular-nums">
        {formatCurrency(toMajor(quote.buyerTotalMinor), currency)}
      </dd>
    </dl>
  );
}
