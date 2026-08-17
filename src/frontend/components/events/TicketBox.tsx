'use client';

import * as React from 'react';
import Link from 'next/link';
import { CreditCard, Loader2, Minus, Plus, ShoppingCart, Wallet } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Label } from '@/frontend/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/frontend/components/ui/radio-group';
import { Separator } from '@/frontend/components/ui/separator';
import { OfflinePayment } from '@/frontend/components/events/OfflinePayment';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useCart } from '@/frontend/hooks/use-cart';
import { useToast } from '@/frontend/hooks/use-toast';
import { formatCurrency } from '@/shared/utils';
import { TicketPrice } from '@/frontend/components/pricing/TicketPrice';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { resolveLinePrice } from '@/shared/pricing';
import { Input } from '@/frontend/components/ui/input';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import type { Event } from '@/shared/types';

/**
 * Buy box. Tier picker + quantity, then either add-to-cart or a direct checkout
 * through Stripe, Bitripay or offline mobile money.
 */
export function TicketBox({ event }: { event: Event }) {
  const { user, userProfile } = useAuth();
  const { addItem } = useCart();
  const { toast } = useToast();

  const [tierId, setTierId] = React.useState(event.ticketTiers[0]?.id ?? 'general');
  const [quantity, setQuantity] = React.useState(1);
  const [bitripayLoading, setBitripayLoading] = React.useState(false);

  const tier = event.ticketTiers.find((t) => t.id === tierId) ?? event.ticketTiers[0];

  /*
   * Pay what you want. The buyer's amount is the price on a `choose` tier, floored at the
   * organiser's minimum. `resolveLinePrice` is the same function the checkout route runs
   * server-side, so what is shown here and what is charged cannot drift — and a tier that
   * is not `choose` ignores this field entirely.
   */
  const isChoose = tier?.pricing === 'choose';
  const [chosen, setChosen] = React.useState<string>('');

  React.useEffect(() => {
    setChosen(
      tier?.pricing === 'choose'
        ? String(tier.suggestedPrice ?? tier.minPrice ?? 0)
        : ''
    );
  }, [tier?.id, tier?.pricing, tier?.suggestedPrice, tier?.minPrice]);

  const unitPrice = tier
    ? resolveLinePrice(tier, isChoose ? Number(chosen) : undefined)
    : 0;
  const lineTotal = unitPrice * quantity;
  // One engine, so this total and the server's charge cannot disagree.
  const quote = computeOrderFees([{ faceMinor: toMinor(unitPrice), qty: quantity }]);
  // A rail with no credentials must not be offered — see use-payment-methods.
  const methods = usePaymentMethods();
  const isFree = unitPrice === 0;

  const handleAddToCart = () => {
    if (!tier) return;
    addItem({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      imageUrl: event.imageUrl,
      tierId: tier.id,
      tierName: tier.name,
      // The chosen amount travels with the cart line. The server re-resolves it against
      // the stored tier at checkout, so this is a carrier, not an authority.
      price: unitPrice,
      currency: event.currency,
      quantity,
    });
    toast({
      title: 'Added to cart',
      description: `${quantity} × ${tier.name} — ${event.title}`,
    });
  };

  const handleBitripay = async () => {
    setBitripayLoading(true);
    try {
      const response = await fetch('/api/bitripay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The all-in total in the event's own currency.
          //
          // This sent `lineTotal` — the face value — in hardcoded USD. The service fee
          // was skipped entirely and a GBP event was charged as dollars. Harmless only
          // because BitriPay has no credentials: it would have started taking the wrong
          // amount in the wrong currency on the day the keys were added, silently.
          amount: toMajor(quote.buyerTotalMinor),
          currency: event.currency,
          reference: `${event.id}:${tier?.id}:${user?.uid ?? 'guest'}`,
        }),
      });
      const data = (await response.json()) as { paymentUrl?: string; error?: string };
      if (!response.ok || !data.paymentUrl) {
        throw new Error(data.error ?? 'Bitripay is unavailable.');
      }
      window.location.href = data.paymentUrl;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Bitripay checkout failed',
        description: error instanceof Error ? error.message : 'Please try another method.',
      });
      setBitripayLoading(false);
    }
  };

  if (!tier) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Tickets for this event are not on sale yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle>Get tickets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <RadioGroup value={tierId} onValueChange={setTierId} className="space-y-2">
          {event.ticketTiers.map((option) => {
            const remaining = option.quantity - (option.sold ?? 0);
            return (
              <Label
                key={option.id}
                htmlFor={`tier-${option.id}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem id={`tier-${option.id}`} value={option.id} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{option.name}</span>
                    <span className="shrink-0 font-semibold text-primary">
                      {/* A minimum is still a price a buyer will pay, so it goes through
                          the same component with `lead` — the fee is inside the figure
                          shown, not added after the click. */}
                      {option.pricing === 'choose' && (option.minPrice ?? 0) <= 0 ? (
                        <span className="text-sm">You choose</span>
                      ) : (
                        <TicketPrice
                          faceMinor={toMinor(
                            option.pricing === 'choose' ? (option.minPrice ?? 0) : option.price
                          )}
                          currency={event.currency}
                          variant={option.pricing === 'choose' ? 'lead' : 'exact'}
                        />
                      )}
                    </span>
                  </div>
                  {option.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {remaining > 0 ? `${remaining} remaining` : 'Sold out'}
                  </p>
                </div>
              </Label>
            );
          })}
        </RadioGroup>

        {isChoose && (
          <div className="space-y-1.5">
            <Label htmlFor="chosen-amount" className="text-sm font-medium">
              What would you like to give?
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{event.currency}</span>
              <Input
                id="chosen-amount"
                type="number"
                min={tier.minPrice ?? 0}
                step="0.01"
                inputMode="decimal"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {(tier.minPrice ?? 0) > 0
                ? `${formatCurrency(tier.minPrice ?? 0, event.currency)} or more.`
                : 'Any amount, including nothing at all.'}
              {Number(chosen) < (tier.minPrice ?? 0) &&
                ` We will charge the ${formatCurrency(tier.minPrice ?? 0, event.currency)} minimum.`}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Quantity</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center font-medium tabular-nums">{quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Separator />

        {/*
          The all-in total, itemised. Nothing compulsory may appear after this point —
          the price shown here is the price charged, and the checkout below sends the
          same figures to the server, which recomputes them from the event rather than
          trusting anything this form says.
        */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              {quantity} × ticket value
            </span>
            <span className="tabular-nums">
              {isFree ? 'Free' : formatCurrency(lineTotal, event.currency)}
            </span>
          </div>
          {quote.serviceFeeMinor > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">TicketRoyality Service Fee</span>
              <span className="tabular-nums">
                {formatCurrency(toMajor(quote.serviceFeeMinor), event.currency)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm font-medium">Total</span>
            <span className="font-headline text-2xl font-bold text-primary">
              {isFree ? 'Free' : formatCurrency(toMajor(quote.buyerTotalMinor), event.currency)}
            </span>
          </div>
          {!isFree && (
            <p className="text-xs text-muted-foreground">
              The organiser receives {formatCurrency(lineTotal, event.currency)} — 100% of the
              ticket value. We charge them nothing.
            </p>
          )}
        </div>

        <Button variant="royal" className="w-full" onClick={handleAddToCart}>
          <ShoppingCart className="h-4 w-4" /> Add to cart
        </Button>

        {!isFree && (
          <>
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
                or pay now
              </span>
            </div>

            {/*
              A plain form POST keeps the Stripe redirect inside the user's click
              gesture. An async fetch + window.location assignment gets blocked.
            */}
            <form action="/api/checkout" method="POST">
              <input type="hidden" name="name" value={`${event.title} — ${tier.name}`} />
              {/* Carried, not trusted: the route re-resolves it against the stored tier
                  and ignores it outright unless that tier is pay-what-you-want. */}
              <input type="hidden" name="amount" value={unitPrice} />
              <input type="hidden" name="quantity" value={quantity} />
              <input type="hidden" name="currency" value={event.currency} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="tierId" value={tier.id} />
              <input type="hidden" name="userId" value={user?.uid ?? ''} />
              <Button type="submit" variant="outline" className="w-full">
                <CreditCard className="h-4 w-4" /> Pay with Stripe
              </Button>
            </form>

            {methods.bitripay && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleBitripay}
              disabled={bitripayLoading}
            >
              {bitripayLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              Pay with Bitripay
            </Button>
            )}

            {userProfile ? (
              <OfflinePayment event={event} amount={lineTotal} user={userProfile} />
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Log in
                </Link>{' '}
                to pay by mobile money.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
