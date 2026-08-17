'use client';

import * as React from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
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
import { getEventsByOrganizer, getTicketsForOrganizer } from '@/shared/data/repositories';
import {
  arrivalCurve,
  attendance,
  fanSummary,
  forecastSellOut,
  leadTimes,
  liveTickets,
  salesByDay,
  tierMix,
} from '@/shared/analytics';
import { formatCurrency } from '@/shared/utils';
import type { Event, Ticket, UserProfile } from '@/shared/types';

const SLICE_COLORS = ['#E0A82E', '#3B82F6', '#EF4444', '#10B981', '#A855F7', '#F97316'];

function Panel({
  title,
  description,
  children,
  empty,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Shown instead of the chart. An empty chart is a lie about having no data. */
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Analytics an organiser can act on.
 *
 * Every figure comes from `shared/analytics.ts`, which is pure and tested, so what is
 * drawn here and what a test asserts cannot drift. Nothing is modelled except the
 * sell-out forecast, which states its own window and refuses to give a date it cannot
 * support — an organiser who cannot check a number should not be staffing a door on it.
 */
function Analytics({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [eventId, setEventId] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getEventsByOrganizer(profile.uid), getTicketsForOrganizer(profile.uid)])
      .then(([e, t]) => {
        if (cancelled) return;
        setEvents(e);
        setTickets(t);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selected = events.find((e) => e.id === eventId);
  const scoped = selected ? tickets.filter((t) => t.eventId === selected.id) : tickets;
  const live = liveTickets(scoped);

  const days = salesByDay(scoped);
  const mix = tierMix(scoped);
  const door = attendance(scoped);
  const fans = fanSummary(tickets); // Always across everything — a fan is not per event.
  const curve = selected ? arrivalCurve(scoped, selected.date) : [];
  const bands = selected ? leadTimes(scoped, selected.date) : [];
  const capacity = selected
    ? (selected.capacity ?? selected.ticketTiers.reduce((sum, t) => sum + t.quantity, 0))
    : 0;
  const forecast = selected ? forecastSellOut(scoped, capacity, selected.date) : null;
  const currency = selected?.currency ?? events[0]?.currency ?? 'GBP';
  const gross = live.reduce((sum, t) => sum + t.price, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Measured from your own tickets. Refunded tickets are excluded from every sales
            figure and counted as churn.
          </p>
        </div>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-full sm:w-[320px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every event</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Tickets sold', value: String(live.length) },
          { label: 'Gross', value: formatCurrency(gross, currency) },
          {
            label: 'Turned up',
            value: door.rate === null ? '—' : `${Math.round(door.rate * 100)}%`,
            sub: door.rate === null ? 'Nothing sold yet' : `${door.noShows} no-shows`,
          },
          {
            label: 'Repeat buyers',
            value: fans.repeatRate === null ? '—' : `${Math.round(fans.repeatRate * 100)}%`,
            sub: `${fans.repeatBuyers} of ${fans.uniqueBuyers} across all your events`,
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-headline text-2xl font-bold">{stat.value}</p>
              {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {forecast && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm">
              {forecast.reason === 'sold-out' ? (
                <>Sold out — {capacity} of {capacity} gone.</>
              ) : forecast.reason === 'no-sales' ? (
                <>
                  No sales in the last two weeks. {forecast.remaining} still available, and at this
                  rate they stay available.
                </>
              ) : forecast.reason === 'after-event' ? (
                <>
                  At {forecast.dailyRate.toFixed(1)} a day, the remaining {forecast.remaining} will
                  not sell before the doors. Worth a push, or worth accepting the room is bigger
                  than the audience.
                </>
              ) : (
                <>
                  At {forecast.dailyRate.toFixed(1)} a day, this sells out around{' '}
                  <span className="font-semibold">
                    {new Date(forecast.projectedDate!).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  .
                </>
              )}{' '}
              <span className="text-muted-foreground">
                {/* The caveat is not buried. A straight line from a short window is
                    checkable in an organiser's head; a black box is not. */}
                Straight line from the last {forecast.windowDays}{' '}
                {forecast.windowDays === 1 ? 'day' : 'days'} of sales
                {forecast.windowDays < 3 ? ' — thin data, treat it as a hint' : ''}.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Sales over time"
          description="Cumulative tickets sold. Days with no sales are shown as days with no sales."
          empty={days.length === 0 ? 'No sales yet.' : undefined}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={days}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number) => [value, 'Sold']}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#E0A82E"
                fill="#E0A82E"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="What sold"
          description="By revenue, which is rarely the same order as by count."
          empty={mix.length === 0 ? 'No sales yet.' : undefined}
        >
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={mix} dataKey="gross" nameKey="tierName" outerRadius={90} label>
                {mix.map((slice, index) => (
                  <Cell key={slice.tierName} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number, name) => [formatCurrency(value, currency), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="When people arrived"
          description="Measured from real door scans, in fifteen-minute buckets around the advertised start. This is the number that decides how many staff stand on a door."
          empty={
            !selected
              ? 'Choose an event to see its door.'
              : curve.length === 0
                ? 'Nobody has been scanned in yet.'
                : undefined
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={curve}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} height={60} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v, 'Arrived']} />
              <Bar dataKey="count" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="How far ahead people book"
          description="Coarse on purpose — what matters is whether your audience books months out or on the day."
          empty={
            !selected
              ? 'Choose an event to see its lead times.'
              : bands.every((b) => b.count === 0)
                ? 'No sales yet.'
                : undefined
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bands}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="band" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v, 'Tickets']} />
              <Bar dataKey="count" fill="#10B981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your regulars</CardTitle>
          <CardDescription>
            Counted by events attended, not tickets bought — four tickets to one show is a group
            of friends, not a returning fan.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {fans.topFans.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No buyers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fans.topFans.map((fan) => (
                  <TableRow key={fan.email}>
                    <TableCell className="font-medium">{fan.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fan.email}</TableCell>
                    <TableCell className="text-right tabular-nums">{fan.events}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(fan.spend, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  return <RequireRole role="organiser">{(profile) => <Analytics profile={profile} />}</RequireRole>;
}
