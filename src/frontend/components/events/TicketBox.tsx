'use client';

import * as React from 'react';
import Link from 'next/link';
import { CreditCard, Loader2, Minus, Plus, ShoppingCart, Smartphone, Wallet } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Label } from '@/frontend/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/frontend/components/ui/radio-group';
import { Separator } from '@/frontend/components/ui/separator';
import { SeatPicker } from '@/frontend/components/events/SeatPicker';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useCart } from '@/frontend/hooks/use-cart';
import { useToast } from '@/frontend/hooks/use-toast';
import { formatCurrency } from '@/shared/utils';
import { DonationBox } from '@/frontend/components/giving/DonationBox';
import { TicketPrice } from '@/frontend/components/pricing/TicketPrice';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { resolveLinePrice, tierSaleWindow, companionRuleBroken } from '@/shared/pricing';
import { meetsTier } from '@/shared/loyalty-tiers';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { track } from '@/frontend/lib/analytics';
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
   * Stock, enforced where the buyer chooses. The stepper was a plain 1–10 control that
   * never looked at the tier, so a page saying "5 remaining" would happily price ten
   * tickets and send the buyer to a payment the hold was always going to refuse. The
   * server hold is still the authority; this stops the order that cannot succeed from
   * being quoted at all.
   */
  const tierRemaining = tier ? Math.max(0, tier.quantity - (tier.sold ?? 0)) : 0;

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

  /*
   * Attendee types — Adult, Child, Student at their own prices, one order, one payment
   * (docs/23 §26). Counts per type; the total drives seats, holds and the fee quote.
   * Prices here are display: the checkout route re-resolves every one from the stored
   * tier, so a tampered page changes what is shown and not what is charged.
   */
  const attendeeTypes = tier?.attendeeTypes ?? [];
  const hasTypes = attendeeTypes.length > 0;
  const [mixCounts, setMixCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    // Reset to one of the first (headline) type when the tier changes.
    setMixCounts(hasTypes ? { [attendeeTypes[0].id]: 1 } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier?.id]);

  /*
   * Who sits where — docs/23 §8. The steppers define the party (2 Adults, 1 Child);
   * once seats are chosen, each seat carries its own editable type, defaulted from the
   * party in order. Editing a seat's type recounts the party from the assignments, so
   * the two views cannot disagree: the assignments are the authority the moment they
   * exist, and the steppers become a running total of them.
   */
  const [seatTypes, setSeatTypes] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!hasTypes || selectedSeats.length === 0) {
      setSeatTypes({});
      return;
    }
    setSeatTypes((current) => {
      // Seats keep their assignment across reselection; new seats take the first type
      // still short of its stepper count, falling back to the headline type.
      const next: Record<string, string> = {};
      const counts: Record<string, number> = {};
      for (const seat of selectedSeats) {
        const kept = current[seat];
        if (kept && attendeeTypes.some((t) => t.id === kept)) {
          next[seat] = kept;
          counts[kept] = (counts[kept] ?? 0) + 1;
        }
      }
      for (const seat of selectedSeats) {
        if (next[seat]) continue;
        const wanting = attendeeTypes.find(
          (t) => (counts[t.id] ?? 0) < (mixCounts[t.id] ?? 0)
        );
        const typeId = wanting?.id ?? attendeeTypes[0].id;
        next[seat] = typeId;
        counts[typeId] = (counts[typeId] ?? 0) + 1;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeats.join(','), hasTypes, tier?.id]);

  const seatAssigned = hasTypes && selectedSeats.length > 0;

  /** The party size the steppers ask for — the seat picker's cap, whatever is assigned. */
  const partyTarget = attendeeTypes.reduce((sum, type) => sum + (mixCounts[type.id] ?? 0), 0);

  const mixEntries = attendeeTypes
    .map((type) => ({
      type,
      count: seatAssigned
        ? selectedSeats.filter((seat) => seatTypes[seat] === type.id).length
        : (mixCounts[type.id] ?? 0),
    }))
    .filter((entry) => entry.count > 0);
  const mixTotalQuantity = mixEntries.reduce((sum, entry) => sum + entry.count, 0);

  /*
   * Issuance pairs seats[i] with the i-th person of the flattened mix, so the seats are
   * posted grouped by type in the same order the mix declares — A10(Adult), A12(Adult),
   * A11(Child) — and everyone's ticket names the seat they actually chose.
   */
  const orderedSeats = seatAssigned
    ? attendeeTypes.flatMap((type) => selectedSeats.filter((seat) => seatTypes[seat] === type.id))
    : selectedSeats;

  const unitPrice = tier
    ? resolveLinePrice(tier, isChoose ? Number(chosen) : undefined)
    : 0;
  const effectiveQuantity = hasTypes ? mixTotalQuantity : quantity;
  const lineTotal = hasTypes
    ? mixEntries.reduce((sum, entry) => sum + entry.type.price * entry.count, 0)
    : unitPrice * quantity;
  /*
   * One engine, so this total and the server's charge cannot disagree — and on a
   * USD/CDF event the quote is the CONGOLESE config at the mobile-money rail, which
   * carries the 2% operator surcharge. The advertised price always contains the worst
   * rail (see allInTicketPriceMinor's doctrine): paying by card can come out cheaper
   * than the figure shown, never dearer. Without this the page showed the card total
   * and KODA then asked for 2% more, live.
   */
  const isMomoCurrency = ['USD', 'CDF'].includes(event.currency?.toUpperCase() ?? '');
  const quote = computeOrderFees(
    hasTypes
      ? mixEntries.map((entry) => ({ faceMinor: toMinor(entry.type.price), qty: entry.count }))
      : [{ faceMinor: toMinor(unitPrice), qty: quantity }],
    isMomoCurrency ? { rail: 'bitripay_momo', countryCode: 'CD' } : undefined
  );
  // A rail with no credentials must not be offered — see use-payment-methods.
  const methods = usePaymentMethods();
  /*
   * docs/25 §20 — the same function the server runs in resolveMix, so the button and
   * the checkout refuse with one sentence. Advisory here, binding there.
   */
  const companionIssue = hasTypes
    ? companionRuleBroken(
        attendeeTypes,
        mixEntries.map((entry) => ({
          typeId: entry.type.id,
          typeName: entry.type.name,
          quantity: entry.count,
        }))
      )
    : null;

  const isFree = hasTypes ? lineTotal === 0 : unitPrice === 0;

  /*
   * A priced tier whose chosen types are all £0 is broken data, not a free event — the
   * checkout route refuses it with the same reasoning, so surfacing it here saves the
   * buyer a round trip to a cancel page. See the guard in /api/checkout.
   */
  const misconfiguredFree =
    isFree &&
    hasTypes &&
    tier?.pricing !== 'choose' &&
    (tier?.price ?? 0) > 0;

  const handleAddToCart = () => {
    if (!tier) return;
    const lineQuantity = hasTypes || isSeated ? effectiveQuantity : quantity;
    addItem({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      imageUrl: event.imageUrl,
      tierId: tier.id,
      tierName: tier.name,
      // The amount travels with the cart line for display only. The server re-resolves
      // every price against the stored tier at checkout — carrier, not authority. A
      // mixed line carries the order average so the cart's subtotal maths still work.
      price:
        hasTypes && lineQuantity > 0
          ? Math.round((lineTotal / lineQuantity) * 100) / 100
          : unitPrice,
      currency: event.currency,
      quantity: lineQuantity,
      // Seats and the type mix ride along so several categories — GA beside seated
      // VIP beside Children — can live in ONE basket and be paid in one payment. The
      // checkout locks the seats and re-prices the mix server-side.
      ...(isSeated && orderedSeats.length > 0 ? { seats: orderedSeats } : {}),
      ...(hasTypes
        ? {
            mix: mixEntries.map((entry) => ({
              typeId: entry.type.id,
              quantity: entry.count,
            })),
          }
        : {}),
    });
    toast({
      title: 'Added to cart',
      description: `${lineQuantity} × ${tier.name} — ${event.title}${
        isSeated && orderedSeats.length > 0 ? ` (seats ${orderedSeats.join(', ')})` : ''
      }`,
    });
    track('add_to_cart', {
      id: event.id,
      name: event.title,
      value: hasTypes ? lineTotal : unitPrice * lineQuantity,
      currency: event.currency,
      quantity: lineQuantity,
      category: tier.name,
    });
  };

  const [kodaLoading, setKodaLoading] = React.useState(false);

  /*
   * KODA hosted mobile money. The server re-prices everything from the stored tier and
   * reserves the seats before creating the intent; this handler only carries ids and
   * counts, then follows the returned checkout URL — KODA's own interface takes it from
   * there, and its signed webhook is what issues the tickets.
   */
  const handleKoda = async () => {
    if (!tier) return;
    setKodaLoading(true);
    track('begin_checkout', {
      id: event.id,
      name: event.title,
      value: toMajor(quote.buyerTotalMinor + donationMinor),
      currency: event.currency,
      quantity: effectiveQuantity,
      category: 'mobile-money',
    });
    try {
      const response = await authedFetch('/api/koda-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          tierId: tier.id,
          quantity: effectiveQuantity,
          seats: orderedSeats,
          // A one-off gift rides mobile money too; only MONTHLY gifts are card-only.
          donationMinor,
          ...(hasTypes
            ? {
                mix: mixEntries.map((entry) => ({
                  typeId: entry.type.id,
                  quantity: entry.count,
                })),
              }
            : {}),
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Mobile money is unavailable.');
      window.location.assign(data.url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Mobile money unavailable',
        description: error instanceof Error ? error.message : 'Try another payment method.',
      });
      setKodaLoading(false);
    }
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
  const seatsChosen = selectedSeats.length === effectiveQuantity;

  /*
   * Seats the current selection would strand, reported by the picker with the same
   * pure function the server enforces at hold time. While this is non-empty every
   * buy button is DISABLED and says so — the refusal used to arrive only after
   * tapping Pay, where it read as the payment rail being broken.
   */
  const [orphanSeats, setOrphanSeats] = React.useState<string[]>([]);
  const orphanBlocked = isSeated && orphanSeats.length > 0;
  const orphanLabel = `Leaves seat ${orphanSeats.join(', ')} stranded — adjust your seats`;

  /*
   * The one legitimate way to ask for more than the tier holds: the organiser opted
   * into sellout upgrades, where a clean sold-out on an unseated order is retried
   * against the next tier up (see /api/checkout). Seated orders never qualify —
   * chosen seats cannot follow the buyer into a different room.
   */
  const canOverbuyForUpgrade = Boolean(event.autoUpgradeOnSellout) && !isSeated;
  const maxBuyable = canOverbuyForUpgrade ? 10 : Math.min(10, tierRemaining);
  const soldOut = tierRemaining === 0 && !canOverbuyForUpgrade;

  React.useEffect(() => {
    // Switching to a tier with less stock must shrink the order, not carry a quantity
    // the new tier cannot honour.
    setQuantity((q) => Math.min(q, Math.max(1, maxBuyable)));
  }, [maxBuyable]);

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
        {event.ticketReleaseAt && new Date(event.ticketReleaseAt).getTime() > Date.now() && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Tickets are held.</strong> Buy now and you’ll get
            a purchase confirmation; your scannable ticket unlocks on{' '}
            {new Date(event.ticketReleaseAt).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            .
          </div>
        )}
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
            quantity={hasTypes ? Math.max(1, partyTarget) : effectiveQuantity}
            selected={selectedSeats}
            onChange={setSelectedSeats}
            onOrphans={setOrphanSeats}
          />
        )}

        {/* docs/23 §8 — the basket the spec draws: each chosen seat with its own
            ticket type and its own price, edited seat by seat, one payment. */}
        {isSeated && seatAssigned && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Who sits where
            </p>
            {selectedSeats.map((seat) => {
              const typeId = seatTypes[seat] ?? attendeeTypes[0].id;
              const type = attendeeTypes.find((t) => t.id === typeId) ?? attendeeTypes[0];
              return (
                <div key={seat} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium tabular-nums">{seat}</span>
                  <div className="flex items-center gap-2">
                    <select
                      // 16px on mobile or the browser zooms the whole page in on focus
                      // and STAYS zoomed — the "everything is cut off on my phone"
                      // report, twice. Same rule as components/ui/input.tsx.
                      className="h-9 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-sm"
                      value={typeId}
                      aria-label={`Ticket type for seat ${seat}`}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSeatTypes((current) => {
                          const next = { ...current, [seat]: value };
                          // The steppers follow the seats: one party, counted one way.
                          setMixCounts(() => {
                            const counts: Record<string, number> = {};
                            for (const chosen of selectedSeats) {
                              const t = next[chosen] ?? attendeeTypes[0].id;
                              counts[t] = (counts[t] ?? 0) + 1;
                            }
                            return counts;
                          });
                          return next;
                        });
                      }}
                    >
                      {attendeeTypes.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} —{' '}
                          {option.price === 0
                            ? 'Free'
                            : formatCurrency(option.price, event.currency)}
                        </option>
                      ))}
                    </select>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {type.price === 0 ? 'Free' : formatCurrency(type.price, event.currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasTypes && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Who is coming?</span>
            {attendeeTypes.map((type) => {
              const count = mixCounts[type.id] ?? 0;
              return (
                <div key={type.id} className="flex items-center justify-between">
                  <span className="text-sm">
                    {type.name}
                    <span className="ml-2 text-muted-foreground">
                      {type.price === 0 ? 'Free' : formatCurrency(type.price, event.currency)}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setMixCounts((current) => ({
                          ...current,
                          [type.id]: Math.max(0, (current[type.id] ?? 0) - 1),
                        }))
                      }
                      aria-label={`Fewer ${type.name}`}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-medium tabular-nums">{count}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setMixCounts((current) => {
                          // The party as a whole is capped by the tier's stock, not
                          // each type separately — 3 Adults + 3 Children is six seats.
                          const total = attendeeTypes.reduce(
                            (sum, t) => sum + (current[t.id] ?? 0),
                            0
                          );
                          if (total >= maxBuyable) return current;
                          return {
                            ...current,
                            [type.id]: Math.min(10, (current[type.id] ?? 0) + 1),
                          };
                        })
                      }
                      disabled={partyTarget >= maxBuyable}
                      aria-label={`More ${type.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {companionIssue ? (
              <p className="text-xs text-destructive">{companionIssue}</p>
            ) : null}
          </div>
        )}

        {!hasTypes && (
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
              onClick={() => setQuantity((q) => Math.min(Math.max(1, maxBuyable), q + 1))}
              disabled={quantity >= maxBuyable}
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        )}

        {/* Why the + button stopped: the stock did, not the software. */}
        {!soldOut && !canOverbuyForUpgrade && tierRemaining < 10 && (
          <p className="text-right text-xs text-muted-foreground">
            Only {tierRemaining} left for this ticket type.
          </p>
        )}

        {/*
          Placed **above** the total, never after it. A donation is optional, but once it
          is chosen it is part of what the card is charged — and a page that adds an
          amount below the total it just showed is doing the exact thing the drip-pricing
          rules exist to stop, optional or not.
        */}
        <DonationBox event={event} onAmountChange={setDonationMinor} userId={user?.uid} />

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
              {effectiveQuantity} × ticket value
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
          A hidden tier is bought here or not at all — the cart carries no access code,
          so a basket holding one would be refused at checkout. Everything else can go
          in the basket, seats and type mixes included: "you can't add anything in the
          basket" was the live complaint when seated and mixed tiers were direct-only,
          and it made buying two categories together impossible. The seats a basket
          carries are locked server-side at checkout, not before — the buyer is told
          if one was taken in the meantime.
        */}
        {tier.visibility === 'hidden' ? (
          <p className="text-center text-xs text-muted-foreground">
            This ticket type is bought directly rather than through the cart.
          </p>
        ) : isFree ? null : (
          <Button
            variant="royal"
            className="w-full"
            onClick={handleAddToCart}
            disabled={
              !selectedWindow.onSale ||
              !loyaltyOk ||
              soldOut ||
              orphanBlocked ||
              (isSeated && !seatsChosen) ||
              (hasTypes && effectiveQuantity === 0) ||
              Boolean(companionIssue)
            }
          >
            <ShoppingCart className="h-4 w-4" />{' '}
            {soldOut
              ? 'Sold out'
              : orphanBlocked
                ? orphanLabel
                : hasTypes && effectiveQuantity === 0
                  ? 'Choose your tickets above'
                  : isSeated && !seatsChosen
                    ? `Choose ${effectiveQuantity - selectedSeats.length} more seat${effectiveQuantity - selectedSeats.length === 1 ? '' : 's'} to add`
                    : 'Add to cart'}
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

        {/*
          The free claim, direct. A free tier used to offer only "Add to cart", and the
          cart's one exit was a Stripe session — which refuses a zero total. The same
          form as the paid path, same server-side re-pricing, same holds; the route sees
          the zero total and issues instead of charging.
        */}
        {misconfiguredFree && selectedWindow.onSale && (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
            The prices on this ticket type are not set up correctly — please contact the
            organiser.
          </p>
        )}

        {isFree && !misconfiguredFree && selectedWindow.onSale && loyaltyOk && donationMinor === 0 && (
          <form
            action="/api/checkout"
            method="POST"
            onSubmit={() =>
              track('begin_checkout', {
                id: event.id,
                name: event.title,
                value: 0,
                currency: event.currency,
                quantity: effectiveQuantity,
                category: 'free',
              })
            }
          >
            <input type="hidden" name="name" value={`${event.title} — ${tier.name}`} />
            <input type="hidden" name="amount" value={0} />
            <input type="hidden" name="quantity" value={effectiveQuantity} />
            {hasTypes && (
              <input
                type="hidden"
                name="mix"
                value={JSON.stringify(
                  mixEntries.map((entry) => ({ typeId: entry.type.id, quantity: entry.count }))
                )}
              />
            )}
            <input type="hidden" name="currency" value={event.currency} />
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="tierId" value={tier.id} />
            <input type="hidden" name="userId" value={user?.uid ?? ''} />
            <input type="hidden" name="accessCode" value={accessCode} />
            <input type="hidden" name="seats" value={orderedSeats.join(',')} />
            {user ? (
              <Button
                type="submit"
                variant="royal"
                className="w-full"
                disabled={soldOut || orphanBlocked || (isSeated && !seatsChosen) || Boolean(companionIssue)}
              >
                {soldOut
                  ? 'Sold out'
                  : orphanBlocked
                    ? orphanLabel
                    : isSeated && !seatsChosen
                      ? `Choose ${effectiveQuantity - selectedSeats.length} more seat${effectiveQuantity - selectedSeats.length === 1 ? '' : 's'}`
                      : `Get ${effectiveQuantity} free ticket${effectiveQuantity === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Log in
                </Link>{' '}
                to claim free tickets — they need an account to live in.
              </p>
            )}
          </form>
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
            <form
              action="/api/checkout"
              method="POST"
              onSubmit={() =>
                track('begin_checkout', {
                  id: event.id,
                  name: event.title,
                  value: toMajor(quote.buyerTotalMinor + donationMinor),
                  currency: event.currency,
                  quantity: effectiveQuantity,
                  category: 'stripe',
                })
              }
            >
              <input type="hidden" name="name" value={`${event.title} — ${tier.name}`} />
              {/* Carried, not trusted: the route re-resolves it against the stored tier
                  and ignores it outright unless that tier is pay-what-you-want. */}
              <input type="hidden" name="amount" value={unitPrice} />
              <input type="hidden" name="quantity" value={effectiveQuantity} />
            {hasTypes && (
              <input
                type="hidden"
                name="mix"
                value={JSON.stringify(
                  mixEntries.map((entry) => ({ typeId: entry.type.id, quantity: entry.count }))
                )}
              />
            )}
              <input type="hidden" name="currency" value={event.currency} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="tierId" value={tier.id} />
              <input type="hidden" name="userId" value={user?.uid ?? ''} />
              {/* Re-verified server-side. Present only when a hidden tier was unlocked. */}
              <input type="hidden" name="accessCode" value={accessCode} />
              {/* The seats are re-locked server-side inside the hold transaction, so this
                  is what the buyer chose, not what they are entitled to. */}
              <input type="hidden" name="seats" value={orderedSeats.join(',')} />
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
                disabled={soldOut || orphanBlocked || (isSeated && !seatsChosen) || (hasTypes && effectiveQuantity === 0) || Boolean(companionIssue)}
              >
                <CreditCard className="h-4 w-4" />
                {/* A disabled button must say why, or it reads as broken. */}
                {soldOut
                  ? 'Sold out'
                  : orphanBlocked
                    ? orphanLabel
                    : hasTypes && effectiveQuantity === 0
                      ? 'Choose your tickets above'
                      : isSeated && !seatsChosen
                        ? `Choose ${effectiveQuantity - selectedSeats.length} more seat${effectiveQuantity - selectedSeats.length === 1 ? '' : 's'}`
                        : 'Pay with Stripe'}
              </Button>
            </form>

            {/*
              A one-off gift rides Stripe AND mobile money now — the KODA intent carries
              it and the webhook records it with no platform fee, mirroring the card
              rail. Bitripay alone would drop it, so that button stays disabled with a
              gift aboard. Only a MONTHLY gift is card-by-nature (no pull payments on
              mobile money).
            */}
            {donationMinor > 0 && methods.bitripay && (
              <p className="text-center text-xs text-muted-foreground">
                Bitripay cannot carry the donation — pay by card or mobile money.
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

            {/*
              Mobile money is KODA's hosted page, and nothing else, ever. A manual
              "pay to this number" panel used to render here as the fallback — with
              PLACEHOLDER numbers from the repo's constants, four fictional wallets a
              real buyer nearly paid in live testing. A payment surface that cannot be
              correct must not exist: KODA (USD/CDF, the merchant's real enrolled
              numbers, verified codes) or no mobile money at all.
            */}
            {userProfile && ['USD', 'CDF'].includes(event.currency?.toUpperCase() ?? '') ? (
              methods.koda ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleKoda}
                  disabled={
                    soldOut ||
                    orphanBlocked ||
                    kodaLoading ||
                    (isSeated && !seatsChosen) ||
                    (hasTypes && effectiveQuantity === 0) ||
                    Boolean(companionIssue)
                  }
                >
                  {kodaLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Smartphone className="h-4 w-4" />
                  )}
                  {/* Same explanations as the card button: silent disabled = "broken". */}
                  {soldOut
                    ? 'Sold out'
                    : orphanBlocked
                      ? orphanLabel
                      : hasTypes && effectiveQuantity === 0
                        ? 'Choose your tickets above'
                        : isSeated && !seatsChosen
                          ? `Choose ${effectiveQuantity - selectedSeats.length} more seat${effectiveQuantity - selectedSeats.length === 1 ? '' : 's'}`
                          : 'Pay with Mobile Money'}
                </Button>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Mobile money is temporarily unavailable — pay by card above.
                </p>
              )
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
