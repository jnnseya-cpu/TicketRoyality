'use client';

import Link from 'next/link';
import { CalendarDays, MapPin, QrCode } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { TicketModal } from '@/frontend/components/tickets/TicketModal';
import { formatCurrency, formatEventDate } from '@/shared/utils';
import type { Ticket } from '@/shared/types';

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const statusVariant =
    ticket.status === 'valid' ? 'success' : ticket.status === 'redeemed' ? 'gold' : 'destructive';

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/events/${ticket.eventId}`}
            className="font-medium leading-snug hover:text-primary"
          >
            {ticket.eventTitle}
          </Link>
          <Badge variant={statusVariant}>{ticket.status}</Badge>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatEventDate(ticket.eventDate)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            {ticket.eventLocation}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="text-sm">
            <p className="font-medium">{ticket.tierName}</p>
            <p className="text-xs text-muted-foreground">
              {ticket.seat ? `Seat ${ticket.seat} · ` : ''}
              {ticket.price === 0 ? 'Free' : formatCurrency(ticket.price, ticket.currency)}
            </p>
          </div>
          <TicketModal
            ticket={ticket}
            trigger={
              <Button size="sm" variant="outline">
                <QrCode className="h-4 w-4" /> View ticket
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
