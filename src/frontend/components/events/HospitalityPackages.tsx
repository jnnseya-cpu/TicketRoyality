'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Users } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { track } from '@/frontend/lib/analytics';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';
import type { Event } from '@/shared/types';

/**
 * Hospitality tables on the event page.
 *
 * Reserving is deliberately not a payment. The table is held the moment it is reserved —
 * which is what stops two parties booking the same one — and the buyer is then taken to
 * their bookings to pay the deposit or the whole thing. Putting a card form here would
 * mean a table that is only reserved once the payment clears, and the second buyer would
 * find that out after entering their details.
 *
 * The price shown is the all-in price from the same engine the server charges with, so
 * this page and the Stripe session cannot disagree.
 */
export function HospitalityPackages({ event }: { event: Event }) {
  const packages = event.hospitality ?? [];
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (packages.length === 0) return null;

  const reserve = async (packageId: string) => {
    if (!user) {
      router.push(`/login?next=/events/${event.id}`);
      return;
    }
    track('reserve_table', {
      id: event.id,
      name: event.title,
      currency: event.currency,
      category: 'hospitality',
    });

    setBusyId(packageId);
    try {
      const response = await authedFetch('/api/hospitality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'book', eventId: event.id, packageId }),
      });
      const data = (await response.json()) as { bookingId?: string; error?: string };
      if (!response.ok || !data.bookingId) {
        throw new Error(data.error ?? 'That table could not be reserved.');
      }

      toast({
        title: 'Table reserved',
        description: 'Pay the deposit to keep it. Nothing is charged until you do.',
      });
      router.push(`/dashboard/customer/bookings?booking=${data.bookingId}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not reserve that table',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <h2 className="mb-3 font-headline text-xl font-semibold">Hospitality</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {packages.map((pkg) => {
          const tier = event.ticketTiers.find((t) => t.id === pkg.tierId);
          if (!tier) return null;

          const available = tier.quantity - (tier.sold ?? 0) - (tier.held ?? 0);
          const soldOut = available < pkg.covers;
          const quote = computeOrderFees([
            { faceMinor: toMinor(tier.price), qty: pkg.covers },
          ]);
          const depositPercent = Math.min(100, Math.max(1, pkg.depositPercent || 100));
          const depositMinor =
            depositPercent >= 100
              ? quote.buyerTotalMinor
              : Math.round((quote.buyerTotalMinor * depositPercent) / 100);

          return (
            <Card key={pkg.id} className="flex flex-col border-primary/25">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-3">
                  <span>{pkg.name}</span>
                  <span className="shrink-0 font-headline text-xl text-primary">
                    {formatCurrency(toMajor(quote.buyerTotalMinor), event.currency)}
                  </span>
                </CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Table of {pkg.covers} — everything included in
                  the price shown
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                {pkg.inclusions.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {pkg.inclusions.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-2">
                  {depositPercent < 100 && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(toMajor(depositMinor), event.currency)} due now, the rest
                      {pkg.balanceDueDate
                        ? ` by ${new Date(pkg.balanceDueDate).toLocaleDateString('en-GB')}`
                        : ' before the event'}
                      . Tickets are issued once the balance is settled.
                    </p>
                  )}
                  <Button
                    variant="royal"
                    className="w-full"
                    disabled={soldOut || busyId === pkg.id}
                    onClick={() => reserve(pkg.id)}
                  >
                    {busyId === pkg.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {soldOut ? 'No tables left' : 'Reserve this table'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
