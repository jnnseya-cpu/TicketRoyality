'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, UtensilsCrossed } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { toMajor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';
import type { Event, HospitalityBooking, UserProfile } from '@/shared/types';

type Booking = HospitalityBooking & { packageName?: string; currency?: string };

const STATUS: Record<HospitalityBooking['status'], { text: string; tone: 'secondary' | 'gold' | 'destructive' }> = {
  deposit_pending: { text: 'Awaiting deposit', tone: 'secondary' },
  deposit_paid: { text: 'Balance owing', tone: 'gold' },
  paid: { text: 'Paid', tone: 'gold' },
  cancelled: { text: 'Cancelled', tone: 'destructive' },
  expired: { text: 'Lapsed', tone: 'destructive' },
};

/**
 * The organiser's table plan: who has booked what, what they still owe, and — because
 * this is the question actually asked on the night — who is sitting at each table.
 *
 * Read through the API rather than straight from Firestore, because `firestore.rules`
 * lets a buyer read only their own booking. The route proves the caller owns the event
 * before returning anybody else's.
 */
function OrganiserHospitality({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [eventId, setEventId] = React.useState<string>('');
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getEventsByOrganizer(profile.uid)
      .then((result) => {
        if (cancelled) return;
        // Only events that actually sell tables — an empty picker full of events with no
        // hospitality is a worse answer than saying there is none.
        const withTables = result.filter((e) => (e.hospitality ?? []).length > 0);
        setEvents(withTables);
        setEventId((current) => current || withTables[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  React.useEffect(() => {
    if (!eventId) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authedFetch(`/api/hospitality?eventId=${encodeURIComponent(eventId)}`)
      .then((response) => response.json())
      .then((data: { bookings?: Booking[] }) => {
        if (!cancelled) setBookings(data.bookings ?? []);
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const selected = events.find((e) => e.id === eventId);
  const currency = selected?.currency ?? 'GBP';
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'expired');
  const outstandingMinor = live.reduce(
    (sum, b) => sum + Math.max(0, b.totalMinor - b.paidMinor),
    0
  );
  const coversBooked = live.reduce((sum, b) => sum + b.covers, 0);

  if (!loading && events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <UtensilsCrossed className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            None of your events sell hospitality tables yet.
          </p>
          <Button variant="royal" asChild>
            <Link href="/dashboard/organiser/events/new">Create an event</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">Hospitality</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tables booked, money still owed, and the guest list for each one.
          </p>
        </div>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-full sm:w-[320px]">
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Tables booked', value: String(live.length) },
          { label: 'Covers', value: String(coversBooked) },
          { label: 'Outstanding', value: formatCurrency(toMajor(outstandingMinor), currency) },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="font-headline text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tables booked on this event yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Booked by</TableHead>
                  <TableHead className="text-right">Covers</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Guests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const owed = Math.max(0, booking.totalMinor - booking.paidMinor);
                  const named = (booking.guests ?? []).filter((g) => g.name?.trim());
                  return (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">
                        {booking.packageName ?? 'Table'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {booking.buyerEmail}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{booking.covers}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(toMajor(booking.paidMinor), booking.currency ?? currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {owed > 0
                          ? formatCurrency(toMajor(owed), booking.currency ?? currency)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS[booking.status].tone}>
                          {STATUS[booking.status].text}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {named.length === 0
                          ? 'Not named yet'
                          : named
                              .map((g) =>
                                g.dietary || g.accessibility
                                  ? `${g.name} (${[g.dietary, g.accessibility].filter(Boolean).join('; ')})`
                                  : g.name
                              )
                              .join(', ')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function OrganiserHospitalityPage() {
  return (
    <RequireRole role="organiser">
      {(profile) => <OrganiserHospitality profile={profile} />}
    </RequireRole>
  );
}
