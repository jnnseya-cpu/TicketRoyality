'use client';

import * as React from 'react';
import Link from 'next/link';
import { CreditCard, Smartphone, Ticket } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { useAuth } from '@/frontend/hooks/use-auth';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import { track } from '@/frontend/lib/analytics';
import { formatCurrency } from '@/shared/utils';
import type { SeasonPass } from '@/shared/types';

/**
 * The season-pass offer, on the event page of every fixture a pass covers.
 *
 * The whole selling machinery existed — checkout took a `passId`, availability was
 * checked across every fixture before the card, and settlement issued a ticket per
 * covered event — but NOTHING public ever offered one for sale: the door was built
 * and no path led to it. This card is the path.
 *
 * Fee treatment matches single tickets: the service fee is added server-side at
 * checkout; what this card shows is the pass's face value with "plus the service fee"
 * said next to the buttons rather than a surprise after the click.
 */
export function SeasonPassOffer({
  eventId,
  organizerId,
  currency,
}: {
  eventId: string;
  organizerId: string;
  currency: string;
}) {
  const { user } = useAuth();
  const methods = usePaymentMethods();
  const [passes, setPasses] = React.useState<SeasonPass[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/season-passes?organizerId=${encodeURIComponent(organizerId)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { passes: [] }))
      .then((data: { passes?: SeasonPass[] }) => {
        if (cancelled) return;
        setPasses(
          (data.passes ?? []).filter(
            (pass) =>
              pass.eventIds.includes(eventId) && pass.quantity - (pass.sold ?? 0) > 0
          )
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, organizerId]);

  if (passes.length === 0) return null;

  const momoOk = methods.koda && ['USD', 'CDF'].includes(currency?.toUpperCase() ?? '');

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4 text-primary" /> Season pass
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {passes.map((pass) => {
          const left = pass.quantity - (pass.sold ?? 0);
          return (
            <div key={pass.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{pass.name}</p>
                <span className="shrink-0 font-semibold text-primary">
                  {formatCurrency(pass.price, pass.currency)}
                </span>
              </div>
              {pass.description && (
                <p className="text-xs text-muted-foreground">{pass.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {pass.eventIds.length} fixture{pass.eventIds.length === 1 ? '' : 's'} — this
                  one included
                </Badge>
                {left <= 10 && <Badge variant="gold">Only {left} left</Badge>}
              </div>

              {pass.renewsPassId &&
                pass.holderWindowEnds &&
                new Date(pass.holderWindowEnds).getTime() > Date.now() && (
                  <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    Renewal window — reserved for last season&apos;s pass holders until{' '}
                    {new Date(pass.holderWindowEnds).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                    })}
                    , then open to everyone. If you held last season&apos;s pass, buy now.
                  </p>
                )}

              {user ? (
                <div className="space-y-2 pt-1">
                  {/* Plain form POSTs keep the redirect inside the click gesture. */}
                  <form
                    action="/api/checkout"
                    method="POST"
                    onSubmit={() =>
                      track('begin_checkout', {
                        id: pass.id,
                        name: pass.name,
                        value: pass.price,
                        currency: pass.currency,
                        category: 'season-pass',
                      })
                    }
                  >
                    <input type="hidden" name="passId" value={pass.id} />
                    <input type="hidden" name="userId" value={user.uid} />
                    <input type="hidden" name="currency" value={pass.currency} />
                    <Button type="submit" variant="royal" size="sm" className="w-full">
                      <CreditCard className="h-4 w-4" /> Buy the pass by card
                    </Button>
                  </form>
                  {momoOk && (
                    <form
                      action="/api/checkout"
                      method="POST"
                      onSubmit={() =>
                        track('begin_checkout', {
                          id: pass.id,
                          name: pass.name,
                          value: pass.price,
                          currency: pass.currency,
                          category: 'season-pass-momo',
                        })
                      }
                    >
                      <input type="hidden" name="passId" value={pass.id} />
                      <input type="hidden" name="userId" value={user.uid} />
                      <input type="hidden" name="currency" value={pass.currency} />
                      <input type="hidden" name="rail" value="momo" />
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        <Smartphone className="h-4 w-4" /> Buy by mobile money
                      </Button>
                    </form>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    One payment, a ticket in every covered fixture. The service fee is added
                    at checkout, shown before you pay.
                  </p>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  <Link href="/login" className="text-primary hover:underline">
                    Log in
                  </Link>{' '}
                  to buy the pass — the tickets need an account to live in.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
