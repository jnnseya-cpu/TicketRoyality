'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgePoundSterling,
  CalendarDays,
  Loader2,
  PlusCircle,
  ShoppingBag,
  Ticket as TicketIcon,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Separator } from '@/frontend/components/ui/separator';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { SalesCharts } from '@/frontend/components/dashboard/SalesCharts';
import { getEventsByOrganizer, getTicketsForOrganizer } from '@/shared/data/repositories';
import { formatCurrency, formatEventDate } from '@/shared/utils';
import { commissionTermsFor, settle } from '@/shared/pricing';
import type { Event, Ticket, UserProfile } from '@/shared/types';

function OrganiserOverview({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getEventsByOrganizer(profile.uid), getTicketsForOrganizer(profile.uid)])
      .then(([e, t]) => {
        if (!cancelled) {
          setEvents(e);
          setTickets(t);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  const terms = commissionTermsFor(profile);
  const { gross: grossSales, net: netSales } = settle(tickets, terms);
  const upcoming = events.filter((e) => new Date(e.date).getTime() > Date.now());

  const metrics = [
    { icon: BadgePoundSterling, label: 'Gross sales', value: formatCurrency(grossSales) },
    { icon: ShoppingBag, label: 'Net sales', value: formatCurrency(netSales) },
    { icon: TicketIcon, label: 'Tickets sold', value: tickets.length },
    { icon: CalendarDays, label: 'Upcoming events', value: upcoming.length },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {profile.companyName ?? profile.fullName} · commission {terms.percent}% +{' '}
            {formatCurrency(terms.adminFee)} per ticket
          </p>
        </div>
        <Button variant="royal" asChild>
          <Link href="/dashboard/organiser/events/new">
            <PlusCircle className="h-4 w-4" /> Create event
          </Link>
        </Button>
      </div>

      {profile.status === 'pending' && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Account pending review</AlertTitle>
          <AlertDescription>
            You can build events now, but they stay in draft until an administrator approves your
            organiser account.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <metric.icon className="h-6 w-6 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="truncate font-headline text-xl font-bold">{metric.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SalesCharts tickets={tickets} />

      <Separator />

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-headline text-xl font-semibold">Your events</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/organiser/events">
              Manage all <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You have not created any events yet.</p>
              <Button variant="royal" asChild>
                <Link href="/dashboard/organiser/events/new">Create your first event</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {events.slice(0, 4).map((event) => {
              const sold = tickets.filter((t) => t.eventId === event.id).length;
              const isPast = new Date(event.date).getTime() < Date.now();
              return (
                <Card key={event.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{event.title}</CardTitle>
                      {/* A cancelled event wearing a "Live" badge told an organiser
                          their cancellation had not worked — status outranks the date. */}
                      <Badge
                        variant={
                          event.status === 'cancelled'
                            ? 'destructive'
                            : isPast
                              ? 'secondary'
                              : 'success'
                        }
                      >
                        {event.status === 'cancelled' ? 'Cancelled' : isPast ? 'Past' : 'Live'}
                      </Badge>
                    </div>
                    <CardDescription>{formatEventDate(event.date)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" /> {sold} sold
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/organiser/events/${event.id}/edit`}>Edit</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/events/${event.id}/check-in`}>Check-in</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function OrganiserDashboardPage() {
  return (
    <RequireRole role="organiser">{(profile) => <OrganiserOverview profile={profile} />}</RequireRole>
  );
}
