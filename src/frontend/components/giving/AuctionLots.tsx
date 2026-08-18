'use client';

import * as React from 'react';
import Image from 'next/image';
import { Gavel, Loader2 } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { formatCurrency } from '@/shared/utils';
import { db, isFirebaseConfigured } from '@/shared/firebase/client';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface LotView {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  currency: string;
  startMinor: number;
  incrementMinor: number;
  highBidMinor: number;
  bidCount: number;
  closesAt: string;
  status: 'open' | 'closed' | 'paid';
  reserve: 'none' | 'met' | 'not-met';
  leading: boolean;
}

/**
 * Bidding, from the room.
 *
 * ## The price on screen is a display, not the price
 *
 * By the time a bid arrives the lot has often moved, which is normal in an auction. So a
 * refused bid comes back with the real minimum and the field is refilled with it — "the
 * price is now £120" is a next step, where "bid rejected" is a dead end that makes people
 * stop bidding.
 *
 * ## What is not shown
 *
 * Who else is bidding. An auction is public about money and private about people, and the
 * API never returns the other bidders at all — this component could not leak them if it
 * tried.
 */
export function AuctionLots({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const [lots, setLots] = React.useState<LotView[] | null>(null);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await authedFetch(`/api/auctions?eventId=${encodeURIComponent(eventId)}`);
      const data = (await response.json()) as { lots?: LotView[] };
      setLots(data.lots ?? []);
    } catch {
      setLots([]);
    }
  }, [eventId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /*
   * Live, and it always could have been. The fifteen-second poll this replaces blamed
   * the vendor constraint for not streaming — but the stream was in the stack the whole
   * time: Firestore's own onSnapshot. What actually blocked it was that the lot document
   * carries the high bidder's name, email and secret maximum, and rules cannot hide
   * fields. So the server now writes a public ticker per lot — price, count, close,
   * reserve state, nothing about anybody — in the same transaction as the bid, and the
   * room watches that. The price on this screen moves the moment the hammer would.
   */
  React.useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubscribe = onSnapshot(
      query(collection(db, 'auction_ticker'), where('eventId', '==', eventId)),
      (snap) => {
        setLots((current) => {
          if (!current) return current;
          const byId = new Map(
            snap.docs.map((d) => [d.id, d.data() as {
              status: LotView['status'];
              highBidMinor: number;
              bidCount: number;
              closesAt: string;
              reserve: LotView['reserve'];
            }])
          );
          return current.map((lot) => {
            const live = byId.get(lot.id);
            if (!live) return lot;
            return {
              ...lot,
              status: live.status,
              highBidMinor: live.highBidMinor,
              bidCount: live.bidCount,
              closesAt: live.closesAt,
              reserve: live.reserve,
              // The ticker cannot know who leads — that is the point of it — so a price
              // above what this person committed means they are no longer leading.
              leading: lot.leading && live.highBidMinor <= lot.highBidMinor ? lot.leading : false,
            };
          });
        });
      },
      // A failed stream is silent: the list still loaded, and bids still re-fetch.
      () => undefined
    );

    return unsubscribe;
  }, [eventId]);

  const minimumFor = (lot: LotView) =>
    lot.highBidMinor > 0 ? lot.highBidMinor + lot.incrementMinor : lot.startMinor;

  const submit = async (lot: LotView) => {
    const typed = Number(amounts[lot.id] ?? 0);
    const amountMinor = Math.round(typed * 100);

    setBusy(lot.id);
    try {
      const response = await authedFetch('/api/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId: lot.id, amountMinor }),
      });
      const data = (await response.json()) as { error?: string; minimumMinor?: number };

      if (!response.ok) {
        // Refill with what it would now take, so the next tap is a bid rather than a guess.
        if (data.minimumMinor) {
          setAmounts((a) => ({ ...a, [lot.id]: String(data.minimumMinor! / 100) }));
        }
        toast({ variant: 'destructive', title: 'Not the leading bid', description: data.error });
        await load();
        return;
      }

      const result = data as { leading?: boolean; amountMinor?: number };
      if (result.leading === false) {
        // Settled against a standing maximum inside the same transaction — beaten
        // instantly, and told so, rather than shown as leading and displaced later.
        toast({
          variant: 'destructive',
          title: 'Outbid straight away',
          description: `An earlier bidder's maximum beat yours. The price is now ${formatCurrency((result.amountMinor ?? 0) / 100, lot.currency)}.`,
        });
      } else {
        toast({
          title: 'You are the leading bid',
          description: `${lot.title} — the room sees ${formatCurrency((result.amountMinor ?? 0) / 100, lot.currency)}, and your maximum stays private.`,
        });
      }
      setAmounts((a) => ({ ...a, [lot.id]: '' }));
      await load();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Bid not placed',
        description: 'We could not reach the auction. Nothing has changed.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (lots === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (lots.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-primary" /> Auction
        </CardTitle>
        <CardDescription>
          A winning bid buys the lot, so it is a purchase rather than a gift — Gift Aid does
          not apply to it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {lots.map((lot) => {
          const minimum = minimumFor(lot);
          const closed = lot.status !== 'open' || new Date(lot.closesAt) <= new Date();

          return (
            <div key={lot.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row">
              {lot.imageUrl && (
                <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-md sm:w-32">
                  <Image src={lot.imageUrl} alt={lot.title} fill sizes="128px" className="object-cover" />
                </div>
              )}

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{lot.title}</p>
                    {lot.description && (
                      <p className="text-xs text-muted-foreground">{lot.description}</p>
                    )}
                  </div>
                  {lot.leading && <Badge variant="secondary">You are leading</Badge>}
                </div>

                <p className="text-sm">
                  {lot.highBidMinor > 0 ? (
                    <>
                      <span className="font-headline text-lg font-bold text-primary">
                        {formatCurrency(lot.highBidMinor / 100, lot.currency)}
                      </span>{' '}
                      <span className="text-xs text-muted-foreground">
                        · {lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Bidding starts at {formatCurrency(lot.startMinor / 100, lot.currency)}
                    </span>
                  )}
                  {/* The amount of a reserve is never disclosed — that is the point of one —
                      but whether it has been met is, because a room bidding towards a wall
                      it cannot see stops bidding. */}
                  {lot.reserve === 'not-met' && (
                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-500">
                      Reserve not yet met
                    </span>
                  )}
                  {lot.reserve === 'met' && (
                    <span className="ml-2 text-xs text-success">Reserve met</span>
                  )}
                </p>

                {closed ? (
                  <p className="text-xs text-muted-foreground">Bidding has closed.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="h-9 w-32"
                      placeholder={String(minimum / 100)}
                      value={amounts[lot.id] ?? ''}
                      onChange={(e) => setAmounts((a) => ({ ...a, [lot.id]: e.target.value }))}
                      aria-label="Your maximum bid"
                      title="Your maximum. The room only ever sees the least that currently wins — we bid the minimum needed on your behalf, up to this."
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="royal"
                      disabled={busy === lot.id}
                      onClick={() => void submit(lot)}
                    >
                      {busy === lot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {lot.leading
                        ? 'Raise your max'
                        : `Bid ${formatCurrency(minimum / 100, lot.currency)}+`}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      closes {new Date(lot.closesAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
