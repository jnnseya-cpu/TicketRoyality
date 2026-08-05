'use client';

import * as React from 'react';
import { Download, Loader2, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { getTicketsForOrganizer } from '@/server/database';
import { formatCurrency, formatEventDate } from '@/lib/utils';
import type { Ticket, TicketStatus, UserProfile } from '@/shared/types';

const STATUS_FILTERS: Array<{ id: TicketStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'valid', label: 'Valid' },
  { id: 'redeemed', label: 'Checked in' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'cancelled', label: 'Cancelled' },
];

function toCsv(tickets: Ticket[]) {
  const header = [
    'reference',
    'event',
    'attendee',
    'email',
    'tier',
    'seat',
    'price',
    'currency',
    'status',
    'purchased_at',
    'provider',
  ];
  const rows = tickets.map((t) =>
    [
      t.reference,
      t.eventTitle,
      t.attendeeName,
      t.attendeeEmail,
      t.tierName,
      t.seat ?? '',
      t.price,
      t.currency,
      t.status,
      t.purchasedAt,
      t.paymentProvider,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

function OrganiserTickets({ profile }: { profile: UserProfile }) {
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<TicketStatus | 'all'>('all');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    getTicketsForOrganizer(profile.uid)
      .then((result) => {
        if (!cancelled) setTickets(result);
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
    return tickets.filter((ticket) => {
      if (status !== 'all' && ticket.status !== status) return false;
      if (!term) return true;
      return `${ticket.reference} ${ticket.attendeeName} ${ticket.attendeeEmail} ${ticket.eventTitle}`
        .toLowerCase()
        .includes(term);
    });
  }, [tickets, status, search]);

  const counts = React.useMemo(() => {
    const map: Record<string, number> = { all: tickets.length };
    for (const filter of STATUS_FILTERS) {
      if (filter.id === 'all') continue;
      map[filter.id] = tickets.filter((t) => t.status === filter.id).length;
    }
    return map;
  }, [tickets]);

  const download = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ticketroyality-orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

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
        <div>
          <h1 className="font-headline text-2xl font-bold">Tickets &amp; orders</h1>
          <p className="text-sm text-muted-foreground">
            Every ticket sold across your events, with the customer who bought it.
          </p>
        </div>
        <Button variant="outline" onClick={download} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.id}
            size="sm"
            variant={status === filter.id ? 'secondary' : 'ghost'}
            onClick={() => setStatus(filter.id)}
          >
            {filter.label} ({counts[filter.id] ?? 0})
          </Button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by reference, name or email"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No orders match those filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purchased</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono text-xs">{ticket.reference}</TableCell>
                    <TableCell>
                      <p className="font-medium">{ticket.attendeeName}</p>
                      <p className="text-xs text-muted-foreground">{ticket.attendeeEmail}</p>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">{ticket.eventTitle}</TableCell>
                    <TableCell>{ticket.tierName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(ticket.price, ticket.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ticket.status === 'valid'
                            ? 'success'
                            : ticket.status === 'redeemed'
                              ? 'gold'
                              : 'secondary'
                        }
                      >
                        {ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatEventDate(ticket.purchasedAt)}
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

export default function OrganiserTicketsPage() {
  return (
    <RequireRole role="organiser">{(profile) => <OrganiserTickets profile={profile} />}</RequireRole>
  );
}
