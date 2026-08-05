'use client';

import * as React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import { Logo } from '@/frontend/components/common/Logo';
import { formatCurrency, formatEventDate } from '@/shared/utils';
import type { Ticket } from '@/shared/types';

/**
 * The customer's ticket. The QR payload carries only identifiers — scanning it
 * validates entry for one specific event, it never grants any account access.
 */
export function ticketQrPayload(ticket: Ticket) {
  return JSON.stringify({
    v: 1,
    t: ticket.id,
    e: ticket.eventId,
    u: ticket.userId,
    r: ticket.reference,
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function TicketModal({
  ticket,
  trigger,
}: {
  ticket: Ticket;
  trigger?: React.ReactNode;
}) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const canvas = printRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ticketroyality-${ticket.reference}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            View ticket
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            <Logo className="h-5 w-5" />
            TicketRoyality
          </DialogTitle>
          <DialogDescription>Present this QR code at the gate.</DialogDescription>
        </DialogHeader>

        <div ref={printRef} className="space-y-4">
          <div className="flex justify-center rounded-lg bg-white p-4">
            <QRCodeCanvas
              value={ticketQrPayload(ticket)}
              size={196}
              level="M"
              includeMargin={false}
            />
          </div>

          <p className="text-center text-xs uppercase tracking-[0.2em] text-primary">
            {ticket.organizerName}
          </p>

          <div className="border-t border-dashed border-border pt-4">
            <h3 className="text-center font-headline text-lg font-semibold">{ticket.eventTitle}</h3>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="Attendee" value={ticket.attendeeName} />
            <Row label="Ticket ID" value={<span className="font-mono">{ticket.reference}</span>} />
            <Row label="Ticket type" value={ticket.tierName} />
            <Row label="Seat" value={ticket.seat ?? 'General admission'} />
            <Row label="Date & time" value={formatEventDate(ticket.eventDate)} />
            <Row label="Venue" value={ticket.eventLocation} />
            <Row
              label="Price"
              value={
                ticket.price === 0 ? 'Free' : formatCurrency(ticket.price, ticket.currency)
              }
            />
            <Row
              label="Status"
              value={
                <span
                  className={
                    ticket.status === 'valid'
                      ? 'text-success'
                      : ticket.status === 'redeemed'
                        ? 'text-primary'
                        : 'text-destructive'
                  }
                >
                  {ticket.status === 'valid'
                    ? 'Paid · Valid'
                    : ticket.status === 'redeemed'
                      ? 'Checked in'
                      : ticket.status}
                </span>
              }
            />
          </div>

          <p className="border-t border-dashed border-border pt-3 text-center text-[11px] text-muted-foreground">
            Valid for one entry to this event only. Do not share this code.
          </p>
        </div>

        <DialogFooter className="print-hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4" /> Download QR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
