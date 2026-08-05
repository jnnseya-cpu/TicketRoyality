'use client';

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { getEventsByOrganizer, getTicketsForOrganizer } from '@/server/database';
import { DEFAULT_ADMIN_FEE, DEFAULT_COMMISSION_PERCENT } from '@/shared/constants/billing';
import { formatCurrency } from '@/lib/utils';
import type { Event, Ticket, UserProfile } from '@/shared/types';

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-headline text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function exportCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      header.map((key) => `"${String(row[key]).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Reports({ profile }: { profile: UserProfile }) {
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

  const commissionRate = profile.commissionPercent ?? DEFAULT_COMMISSION_PERCENT;
  const adminFee = profile.adminFee ?? DEFAULT_ADMIN_FEE;

  const gross = tickets.reduce((sum, t) => sum + t.price, 0);
  const refunds = tickets.filter((t) => t.status === 'refunded').reduce((s, t) => s + t.price, 0);
  const commission = (gross * commissionRate) / 100 + adminFee * tickets.length;
  const net = gross - refunds - commission;

  const byEvent = events.map((event) => {
    const sold = tickets.filter((t) => t.eventId === event.id);
    return {
      Event: event.title,
      Category: event.category,
      'Items sold': sold.length,
      'Gross sales': sold.reduce((s, t) => s + t.price, 0).toFixed(2),
      Currency: event.currency,
    };
  });

  const byCategory = Object.values(
    events.reduce<Record<string, { Category: string; Products: number; 'Items sold': number; 'Net sales': number }>>(
      (acc, event) => {
        const sold = tickets.filter((t) => t.eventId === event.id);
        const key = event.category;
        acc[key] ??= { Category: key, Products: 0, 'Items sold': 0, 'Net sales': 0 };
        acc[key].Products += 1;
        acc[key]['Items sold'] += sold.length;
        acc[key]['Net sales'] += sold.reduce((s, t) => s + t.price, 0);
        return acc;
      },
      {}
    )
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
      <div>
        <h1 className="font-headline text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, orders and category performance. Every table exports to CSV for Excel.
        </p>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Gross sales" value={formatCurrency(gross)} />
            <Metric label="Refunds" value={formatCurrency(refunds)} />
            <Metric
              label="Platform commission"
              value={formatCurrency(commission)}
              sub={`${commissionRate}% + ${formatCurrency(adminFee)}/ticket`}
            />
            <Metric label="Net payout" value={formatCurrency(net)} />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Revenue by event</CardTitle>
                <CardDescription>All-time totals per event.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv('revenue-by-event.csv', byEvent)}
                disabled={byEvent.length === 0}
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {byEvent.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Items sold</TableHead>
                      <TableHead className="text-right">Gross sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byEvent.map((row) => (
                      <TableRow key={row.Event}>
                        <TableCell className="font-medium">{row.Event}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row['Items sold']}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(row['Gross sales']), row.Currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Event performance</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv('event-performance.csv', byEvent)}
                disabled={byEvent.length === 0}
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {byEvent.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Items sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byEvent.map((row) => (
                      <TableRow key={row.Event}>
                        <TableCell className="font-medium">{row.Event}</TableCell>
                        <TableCell>{row.Category}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row['Items sold']}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Category breakdown</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv('category-breakdown.csv', byCategory)}
                disabled={byCategory.length === 0}
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {byCategory.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Items sold</TableHead>
                      <TableHead className="text-right">Net sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.map((row) => (
                      <TableRow key={row.Category}>
                        <TableCell className="font-medium">{row.Category}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.Products}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row['Items sold']}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row['Net sales'])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ReportsPage() {
  return <RequireRole role="organiser">{(profile) => <Reports profile={profile} />}</RequireRole>;
}
