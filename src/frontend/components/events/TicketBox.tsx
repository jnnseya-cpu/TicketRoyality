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
import { SeatPicker } from '@/frontend/components/events/SeatPicker';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useCart } from '@/frontend/hooks/use-cart';
import { useToast } from '@/frontend/hooks/use-toast';
import { formatCurrency } from '@/shared/utils';
import { DonationBox } from '@/frontend/components/giving/DonationBox';
import { TicketPrice } from '@/frontend/components/pricing/TicketPrice';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { resolveLinePrice, tierSaleWindow } from '@/shared/pricing';
import { meetsTier } from '@/shared/loyalty-tiers';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { Input } from '@/frontend/components/ui/input';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import type { Event, Membership } from '@/shared/types';

/**
 * Buy box. Tier picker + quantity, then either add-to-cart or a direct checkout
 * through Stripe, Bitripay or offline mobile money.
 */
export function TicketBox({ event }: { event: Event }) {
  const { user, userProfile } = useAuth();
  const { addItem } = useCart();
  const { toast } = useToast();

  /*
   * Hidden tiers are off the list until a code opens them. The server is the authority:
   * checkout refuses to sell a hidden tier without the code however the page looks.
   */
  const [unlockedTierIds, setUnlockedTierIds] = React.useState<string[]>([]);
  const [accessCode, setAccessCode] = React.useState('');
  const [codeEntry, setCodeEntry] = React.useState('');
  const [unlocking, setUnlocking] = React.useState(false);

  const hasHidden = event.ticketTiers.some((t) => t.visibility === 'hidden');
  const visibleTiers = event.ticketTiers.filter(
    (t) => t.visibility !== 'hidden' || unlockedTierIds.includes(t.id)
  );

  const [tierId, setTierId] = React.useState(
    event.ticketTiers.find((t) => t.visibility !== 'hidden' && tierSaleWindow(t).onSale)?.id ??
      event.ticketTiers.find((t) => t.visibility !== 'hidden')?.id ??
      event.ticketTiers[0]?.id ??
      'general'
  );
  const [quantity, setQuantity] = React.useState(1);
  /* A gift riding along with the tickets, in minor units. Zero unless the organiser has
     turned fundraising on and the buyer chose an amount. */
  const [donationMinor, setDonationMinor] = React.useState(0);
  const [bitripayLoading, setBitripayLoading] = React.useState(false);
  const [selectedSeats, setSelectedSeats] = React.useState<string[]>([]);

  /*
   * The buyer's standing with this organiser, so a gated tier can say why rather than
   * failing at the payment page. The server checks this again when the card is charged —
   * this is an explanation, not a permission.
   */
  const [membership, setMembership] = React.useState<Membership | null>(null);

  React.useEffect(() => {
    if (!user) {
      setMembership(null);
      return;
    }
    let cancelled = false;
    authedFetch(`/api/membership?organizerId=${encodeURIComponent(event.organizerId)}`)
      .then((r) => r.json())
      .then((data: { membership?: Membership }) => {
        if (!cancelled) setMembership(data.membership ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, event.organizerId]);

  const tier = visibleTiers.find((t) => t.id === tierId) ?? visibleTiers[0];

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

  const selectedWindow = tier ? tierSaleWindow(tier) : ({ onSale: true } as const);
  const loyaltyOk = meetsTier(membership?.tier ?? 'none', tier?.minLoyaltyTier);

  /*
   * Seats, when the tier has a section mapped to it. A tier with no section sells
   * general admission exactly as before — seat selection is additive, not a new mode
   * every event has to opt out of.
   */
  const seatedSections = (event.seating ?? []).filter((s) => s.tierId === tier?.id);
  const isSeated = seatedSections.length > 0;
  const seatsChosen = selectedSeats.length === quantity;

  React.useEffect(() => {
    // A seat chosen for the stalls is not a seat in the circle, and four seats are not
    // three tickets. Either change starts the choice again rather than silently carrying
    // a selection that no longer matches what is being bought.
    setSelectedSeats([]);
  }, [tierId, quantity]);

  const redeemCode = async () => {
    setUnlocking(true);
    try {
      const response = await fetch(`/api/events/${event.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeEntry }),
      });
      const data = (await response.json()) as { tierIds?: string[]; error?: string };
      if (!response.ok || !data.tierIds?.length) {
        throw new Error(data.error ?? 'That code is not recognised.');
      }

      setUnlockedTierIds((current) => [...new Set([...current, ...(data.tierIds ?? [])])]);
      // Kept so checkout can prove the unlock. The server checks it again — this is a
      // carrier, not a permission.
      setAccessCode(codeEntry);
      setTierId(data.tierIds[0]);
      setCodeEntry('');
      toast({
        title: 'Code accepted',
        description:
          data.tierIds.length === 1
            ? 'Your ticket type is now available.'
            : `${data.tierIds.length} ticket types are now available.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Code not accepted',
        description: error instanceof Error ? error.message : 'Please check it and try again.',
      });
    } finally {
      setUnlocking(false);
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
        <RadioGroup value={tier?.id ?? ''} onValueChange={setTierId} className="space-y-2">
          {visibleTiers.map((option) => {
            const remaining = option.quantity - (option.sold ?? 0);
            const window = tierSaleWindow(option);
            return (
              <Label
                key={option.id}
                htmlFor={`tier-${option.id}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem
                  id={`tier-${option.id}`}
                  value={option.id}
                  className="mt-1"
                  disabled={!window.onSale}
                />
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
                  {/* A tier outside its window says when, rather than how many are left:
                      "12 remaining" on something that does not open until Friday is a
                      number nobody can act on. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!window.onSale
                      ? window.reason === 'not-yet'
                        ? `On sale ${new Date(window.opensAt ?? '').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
                        : 'Sales have closed'
                      : remaining > 0
                        ? `${remaining} remaining`
                        : 'Sold out'}
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

        {hasHidden && unlockedTierIds.length < event.ticketTiers.filter((t) => t.visibility === 'hidden').length && (
          <div className="space-y-1.5 rounded-md border border-dashed border-border p-3">
            <Label htmlFor="access-code" className="text-sm font-medium">
              Have an access code?
            </Label>
            <div className="flex gap-2">
              <Input
                id="access-code"
                value={codeEntry}
                placeholder="Enter your code"
                autoComplete="off"
                onChange={(e) => setCodeEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void redeemCode();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={redeemCode}
                disabled={unlocking || !codeEntry.trim()}
              >
                {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
              </Button>
            </div>
          </div>
        )}

        {isSeated && selectedWindow.onSale && (
          <SeatPicker
            eventId={event.id}
            sections={event.seating ?? []}
            tierId={tier.id}
            quantity={quantity}
            selected={selectedSeats}
            onChange={setSelectedSeats}
          />
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

        {/*
          Placed **above** the total, never after it. A donation is optional, but once it
          is chosen it is part of what the card is charged — and a page that adds an
          amount below the total it just showed is doing the exact thing the drip-pricing
          rules exist to stop, optional or not.
        */}
        <DonationBox event={event} onAmountChange={setDonationMinor} />

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
          {donationMinor > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Donation</span>
              <span className="tabular-nums">
                {formatCurrency(toMajor(donationMinor), event.currency)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm font-medium">Total</span>
            <span className="font-headline text-2xl font-bold text-primary">
              {isFree && donationMinor === 0
                ? 'Free'
                : formatCurrency(toMajor(quote.buyerTotalMinor + donationMinor), event.currency)}
            </span>
          </div>
          {!isFree && (
            <p className="text-xs text-muted-foreground">
              The organiser receives {formatCurrency(lineTotal, event.currency)} — 100% of the
              ticket value. We charge them nothing.
            </p>
          )}
        </div>

        {/*
          A hidden tier is bought here or not at all. The cart spans several events and
          carries no code, so a basket holding one would be refused at checkout — better
          to say so now than after the buyer has assembled an order.
        */}
        {tier.visibility === 'hidden' || isSeated ? (
          <p className="text-center text-xs text-muted-foreground">
            {isSeated
              ? 'Reserved seating is bought directly, so the seats are held while you pay.'
              : 'This ticket type is bought directly rather than through the cart.'}
          </p>
        ) : (
          <Button
          variant="royal"
          className="w-full"
          onClick={handleAddToCart}
          disabled={!selectedWindow.onSale || !loyaltyOk}
        >
            <ShoppingCart className="h-4 w-4" /> Add to cart
          </Button>
        )}

        {tier?.minLoyaltyTier && tier.minLoyaltyTier !== 'none' && !loyaltyOk && (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
            {user
              ? `${tier.name} opens to returning customers first. You have been to ${membership?.eventsAttended ?? 0} of this organiser's events.`
              : `${tier.name} opens to returning customers first — sign in and we will check.`}
          </p>
        )}

        {!selectedWindow.onSale && (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
            {selectedWindow.reason === 'not-yet'
              ? `This ticket type opens ${new Date(selectedWindow.opensAt ?? '').toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}.`
              : 'This ticket type is no longer on sale.'}
          </p>
        )}

        {!isFree && selectedWindow.onSale && loyaltyOk && (
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
              {/* Re-verified server-side. Present only when a hidden tier was unlocked. */}
              <input type="hidden" name="accessCode" value={accessCode} />
              {/* The seats are re-locked server-side inside the hold transaction, so this
                  is what the buyer chose, not what they are entitled to. */}
              <input type="hidden" name="seats" value={selectedSeats.join(',')} />
              {/* The gift. Added to the Stripe session after the fee is computed, so it
                  is charged with no platform fee, and recorded separately from the ticket
                  because Gift Aid can never be claimed on a payment for admission. */}
              <input type="hidden" name="donationMinor" value={donationMinor} />
              <input
                type="hidden"
                name="donationOrganiserId"
                value={donationMinor > 0 ? event.organizerId : ''}
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={isSeated && !seatsChosen}
              >
                <CreditCard className="h-4 w-4" />
                {isSeated && !seatsChosen
                  ? `Choose ${quantity - selectedSeats.length} more seat${quantity - selectedSeats.length === 1 ? '' : 's'}`
                  : 'Pay with Stripe'}
              </Button>
            </form>

            {/*
              A donation rides on the Stripe session only. The other rails would charge
              the ticket total and drop the gift, so the buyer would pay less than the
              total they were just shown and the charity would never see the money. Better
              to say so than to take a payment that quietly disagrees with the page.
            */}
            {donationMinor > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Donations are card-only for now. Remove the donation to pay another way.
              </p>
            )}

            {methods.bitripay && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleBitripay}
              disabled={bitripayLoading || donationMinor > 0}
            >
              {bitripayLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              Pay with Bitripay
            </Button>
            )}

            {userProfile && donationMinor === 0 ? (
              <OfflinePayment event={event} amount={lineTotal} user={userProfile} />
            ) : userProfile ? null : (
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
