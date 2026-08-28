'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDays, Copy, Loader2, PlusCircle, ScanLine, Search } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Calendar } from '@/frontend/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useToast } from '@/frontend/hooks/use-toast';
import { getEventsByOrganizer, getTicketsForOrganizer } from '@/shared/data/repositories';
import { formatCurrency, formatEventDate } from '@/shared/utils';
import type { Event, Ticket, UserProfile } from '@/shared/types';

function CheckInLinkDialog({ event }: { event: Event }) {
  const { toast } = useToast();
  const [origin, setOrigin] = React.useState('');

  // window is unavailable during SSR — read it after mount.
  React.useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/events/${event.id}/check-in`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ScanLine className="h-4 w-4" /> Check-in
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Door check-in portal</DialogTitle>
          <DialogDescription>
            Share this link with your gate staff. It scans tickets for {event.title} only, and gives
            no access to your dashboard, customer records or finances.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link} className="font-mono text-xs" />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast({ title: 'Link copied' });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <Button asChild>
          <Link href={`/events/${event.id}/check-in`}>Open the scanner now</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function OrganiserEvents({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selectedDay, setSelectedDay] = React.useState<Date | undefined>();

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

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return events;
    return events.filter((e) => e.title.toLowerCase().includes(term));
  }, [events, search]);

  const eventsOnDay = React.useMemo(() => {
    if (!selectedDay) return [];
    return filtered.filter((event) => {
      const d = new Date(event.date);
      return (
        d.getFullYear() === selectedDay.getFullYear() &&
        d.getMonth() === selectedDay.getMonth() &&
        d.getDate() === selectedDay.getDate()
      );
    });
  }, [filtered, selectedDay]);

  const soldFor = (eventId: string) => tickets.filter((t) => t.eventId === eventId).length;
  const revenueFor = (eventId: string) =>
    tickets.filter((t) => t.eventId === eventId).reduce((sum, t) => sum + t.price, 0);

  /*
   * "Past" here means exactly what it means on the public site — measured from the start
   * of today (see `getEvents` in repositories.ts), so an event on its own day still counts
   * as upcoming in both places and never lands in one list on the site and the other here.
   * These are the same events either way: the public frontend hides the past ones, this
   * dashboard keeps every one and simply files them under the Past tab.
   */
  const startOfToday = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const isPastEvent = React.useCallback(
    (event: Event) => new Date(event.date) < startOfToday,
    [startOfToday]
  );
  const upcoming = React.useMemo(() => filtered.filter((e) => !isPastEvent(e)), [filtered, isPastEvent]);
  const past = React.useMemo(() => filtered.filter((e) => isPastEvent(e)), [filtered, isPastEvent]);

  const eventTable = (list: Event[], { archived }: { archived: boolean }) => (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">{event.title}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatEventDate(event.date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{soldFor(event.id)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(revenueFor(event.id), event.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant={archived ? 'secondary' : 'success'}>
                    {archived ? 'Past' : event.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/events/${event.id}`}>View</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/organiser/events/${event.id}/edit`}>Edit</Link>
                    </Button>
                    {/* The door scanner is only useful before the event; a finished one
                        gets View and Edit (records, reports, duplication) but no Check-in. */}
                    {!archived && <CheckInLinkDialog event={event} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const emptyCard = (message: string) => (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-bold">Events</h1>
        <Button variant="royal" asChild>
          <Link href="/dashboard/organiser/events/new">
            <PlusCircle className="h-4 w-4" /> Create event
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your events"
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {upcoming.length === 0
            ? emptyCard(
                search
                  ? 'No upcoming events match that search.'
                  : 'No upcoming events. Create one, or check the Past tab for your archive.'
              )
            : eventTable(upcoming, { archived: false })}
        </TabsContent>

        <TabsContent value="past">
          {past.length === 0
            ? emptyCard(
                search
                  ? 'No past events match that search.'
                  : 'No past events yet — finished events are filed here automatically.'
              )
            : eventTable(past, { archived: true })}
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <Card className="w-fit">
              <CardContent className="p-3">
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                  modifiers={{ hasEvent: filtered.map((e) => new Date(e.date)) }}
                  modifiersClassNames={{
                    hasEvent: '[&>button]:font-semibold [&>button]:text-primary',
                  }}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              {!selectedDay ? (
                <p className="text-sm text-muted-foreground">
                  Select a date to see the events scheduled that day.
                </p>
              ) : eventsOnDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled on {selectedDay.toDateString()}.
                </p>
              ) : (
                eventsOnDay.map((event) => (
                  <Card key={event.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{event.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {soldFor(event.id)} sold ·{' '}
                        {formatCurrency(revenueFor(event.id), event.currency)}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/dashboard/organiser/events/${event.id}/edit`}>Edit</Link>
                        </Button>
                        <CheckInLinkDialog event={event} />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function OrganiserEventsPage() {
  return (
    <RequireRole role="organiser">{(profile) => <OrganiserEvents profile={profile} />}</RequireRole>
  );
}
