'use client';

import * as React from 'react';
import { CalendarClock, CreditCard, Loader2, Smartphone, Trash2, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { Separator } from '@/frontend/components/ui/separator';
import { useToast } from '@/frontend/hooks/use-toast';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { toMajor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';
import type { HospitalityBooking, HospitalityGuest } from '@/shared/types';

type Booking = HospitalityBooking & {
  eventTitle?: string;
  packageName?: string;
  currency?: string;
};

const STATUS_LABEL: Record<HospitalityBooking['status'], { text: string; tone: 'secondary' | 'gold' | 'destructive' }> = {
  deposit_pending: { text: 'Awaiting payment', tone: 'secondary' },
  deposit_paid: { text: 'Deposit paid', tone: 'gold' },
  paid: { text: 'Paid in full', tone: 'gold' },
  cancelled: { text: 'Cancelled', tone: 'destructive' },
  expired: { text: 'Lapsed', tone: 'destructive' },
};

/**
 * One booked table: what is owed, when it is owed by, and who is sitting at it.
 *
 * The guest list is editable right up to the doors, because a table booked in March for
 * a dinner in June is booked long before anybody knows who is coming. The count is capped
 * server-side at the covers paid for.
 */
export function BookingCard({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const { toast } = useToast();
  const methods = usePaymentMethods();
  const currency = booking.currency ?? 'GBP';
  const outstanding = Math.max(0, booking.totalMinor - booking.paidMinor);
  const dueNow = booking.paidMinor <= 0 ? booking.depositMinor : outstanding;
  const open = booking.status === 'deposit_pending' || booking.status === 'deposit_paid';

  const [guests, setGuests] = React.useState<HospitalityGuest[]>(() => {
    const seeded = [...(booking.guests ?? [])];
    while (seeded.length < booking.covers) seeded.push({ name: '' });
    return seeded.slice(0, booking.covers);
  });
  const [savingGuests, setSavingGuests] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const update = (index: number, patch: Partial<HospitalityGuest>) =>
    setGuests((current) => current.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  const saveGuests = async () => {
    setSavingGuests(true);
    try {
      const response = await authedFetch('/api/hospitality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guests', bookingId: booking.id, guests }),
      });
      const data = (await response.json()) as { count?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not save that guest list.');
      toast({
        title: 'Guest list saved',
        description: `${data.count} of ${booking.covers} seats named.`,
      });
      onChanged();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not save the guest list',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSavingGuests(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const response = await authedFetch('/api/hospitality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', bookingId: booking.id }),
      });
      const data = (await response.json()) as { refundOwedMinor?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not cancel that booking.');
      toast({
        title: 'Booking cancelled',
        description:
          (data.refundOwedMinor ?? 0) > 0
            ? `The table is back on sale. ${formatCurrency(toMajor(data.refundOwedMinor ?? 0), currency)} already paid is refunded separately.`
            : 'The table is back on sale. Nothing had been paid.',
      });
      onChanged();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not cancel',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const status = STATUS_LABEL[booking.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{booking.packageName ?? 'Hospitality table'}</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Table of {booking.covers}
              {booking.eventTitle ? ` — ${booking.eventTitle}` : ''}
            </CardDescription>
          </div>
          <Badge variant={status.tone}>{status.text}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Table price</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(toMajor(booking.totalMinor), currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid so far</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(toMajor(booking.paidMinor), currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(toMajor(outstanding), currency)}
            </p>
          </div>
        </div>

        {booking.balanceDueDate && outstanding > 0 && open && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Balance due by {new Date(booking.balanceDueDate).toLocaleDateString('en-GB')}. If it is
            not settled, the table goes back on sale.
          </p>
        )}

        {open && dueNow > 0 && (
          // Plain form POSTs so the redirects stay inside the click gesture. The
          // amount is not posted — the server reads what is owed from the booking.
          <div className="space-y-2">
            <form action="/api/hospitality/pay" method="POST">
              <input type="hidden" name="bookingId" value={booking.id} />
              <Button type="submit" variant="royal" className="w-full">
                <CreditCard className="h-4 w-4" />
                Pay {formatCurrency(toMajor(dueNow), currency)}
                {booking.paidMinor <= 0 && dueNow < booking.totalMinor ? ' deposit' : ''}
              </Button>
            </form>
            {/* Mobile money for the corridor KODA serves — USD/CDF bookings only. */}
            {methods.koda && ['USD', 'CDF'].includes(currency.toUpperCase()) && (
              <form action="/api/hospitality/pay" method="POST">
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="rail" value="momo" />
                <Button type="submit" variant="outline" className="w-full">
                  <Smartphone className="h-4 w-4" /> Pay by Mobile Money
                </Button>
              </form>
            )}
          </div>
        )}

        {booking.status === 'deposit_paid' && (
          <p className="text-xs text-muted-foreground">
            Your tickets are issued once the balance is settled — a deposit reserves the table, it
            does not admit anybody.
          </p>
        )}

        {booking.status === 'paid' && (
          <p className="text-xs text-muted-foreground">
            Paid in full. Your {booking.covers} tickets are in your dashboard and scan at the door.
          </p>
        )}

        {open && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Guest list</p>
                <p className="text-xs text-muted-foreground">
                  Name your table. Dietary and access needs go to the organiser, not to us.
                </p>
              </div>

              {guests.map((guest, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs" htmlFor={`${booking.id}-name-${index}`}>
                      Seat {index + 1}
                    </Label>
                    <Input
                      id={`${booking.id}-name-${index}`}
                      value={guest.name}
                      placeholder="Full name"
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`${booking.id}-diet-${index}`}>
                      Dietary
                    </Label>
                    <Input
                      id={`${booking.id}-diet-${index}`}
                      value={guest.dietary ?? ''}
                      placeholder="Optional"
                      onChange={(e) => update(index, { dietary: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`${booking.id}-access-${index}`}>
                      Access needs
                    </Label>
                    <Input
                      id={`${booking.id}-access-${index}`}
                      value={guest.accessibility ?? ''}
                      placeholder="Optional"
                      onChange={(e) => update(index, { accessibility: e.target.value })}
                    />
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={saveGuests} disabled={savingGuests}>
                  {savingGuests && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save guest list
                </Button>
                <Button variant="ghost" onClick={cancel} disabled={cancelling}>
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Cancel this table
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
