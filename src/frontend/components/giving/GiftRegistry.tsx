'use client';

import * as React from 'react';
import Image from 'next/image';
import { Gift, Loader2, Smartphone } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Progress } from '@/frontend/components/ui/progress';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import { formatCurrency } from '@/shared/utils';

interface ItemView {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  currency: string;
  targetMinor: number;
  raisedMinor: number;
  remainingMinor: number;
  contributionCount: number;
  allowPartial: boolean;
}

/**
 * The gift list, from a guest's side.
 *
 * ## Why the amount defaults to what is left
 *
 * A guest who wants to finish off a half-bought item should not have to work out the
 * arithmetic, and one who types more than remains is refused by the server — so the field
 * starts at the remaining balance. The refusal is deliberate rather than trimming the
 * amount: taking £80 towards a £30 balance and keeping the difference is not a decision to
 * make on somebody's behalf.
 *
 * ## What a guest is not shown
 *
 * Who else gave, and how much. That list goes to the couple, not to the room.
 */
export function GiftRegistry({ eventId, userId }: { eventId: string; userId?: string }) {
  const [items, setItems] = React.useState<ItemView[] | null>(null);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const methods = usePaymentMethods();

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/registry?eventId=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: ItemView[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (items === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-primary" /> Gift list
        </CardTitle>
        <CardDescription>
          Give towards something on the list. We charge no fee on a gift — the full amount
          goes to the couple.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {items.map((item) => {
          const funded = item.remainingMinor <= 0;
          const suggested = item.allowPartial ? item.remainingMinor : item.targetMinor;
          const typed = amounts[item.id] ?? String(suggested / 100);

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row"
            >
              {item.imageUrl && (
                <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-md sm:w-32">
                  <Image src={item.imageUrl} alt={item.title} fill sizes="128px" className="object-cover" />
                </div>
              )}

              <div className="flex-1 space-y-2">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>

                <Progress value={Math.min(100, (item.raisedMinor / item.targetMinor) * 100)} />

                <p className="text-xs text-muted-foreground">
                  {funded ? (
                    <span className="text-success">Fully bought — thank you</span>
                  ) : (
                    <>
                      {formatCurrency(item.raisedMinor / 100, item.currency)} of{' '}
                      {formatCurrency(item.targetMinor / 100, item.currency)}
                      {item.allowPartial
                        ? ` · ${formatCurrency(item.remainingMinor / 100, item.currency)} to go`
                        : ' · bought whole'}
                    </>
                  )}
                </p>

                {!funded && (
                  /*
                   * A plain form POST to the same checkout every other payment goes
                   * through, so the redirect stays inside the click gesture and there is
                   * still exactly one money path.
                   */
                  <form action="/api/checkout" method="POST" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="registryItemId" value={item.id} />
                    <input type="hidden" name="registryTitle" value={item.title} />
                    <input type="hidden" name="currency" value={item.currency} />
                    <input type="hidden" name="userId" value={userId ?? ''} />
                    <input
                      type="hidden"
                      name="registryMinor"
                      value={Math.round(Number(typed || 0) * 100)}
                    />

                    {item.allowPartial ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-9 w-28"
                        value={typed}
                        onChange={(e) => setAmounts((a) => ({ ...a, [item.id]: e.target.value }))}
                      />
                    ) : null}

                    <Input
                      name="registryMessage"
                      placeholder="Message for the couple (optional)"
                      className="h-9 w-full sm:w-64"
                    />

                    <Button type="submit" size="sm" variant="royal">
                      Give{' '}
                      {formatCurrency(
                        (item.allowPartial ? Number(typed || 0) : item.targetMinor / 100),
                        item.currency
                      )}
                    </Button>

                    {/* The mobile-money exit, for the corridor KODA serves. Same
                        route, rail=momo; the KODA webhook records the gift. */}
                    {methods.koda && ['USD', 'CDF'].includes(item.currency.toUpperCase()) && (
                      <Button type="submit" size="sm" variant="outline" name="rail" value="momo">
                        <Smartphone className="h-3.5 w-3.5" /> Mobile money
                      </Button>
                    )}
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
