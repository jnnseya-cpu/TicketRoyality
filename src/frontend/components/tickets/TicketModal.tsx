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
import { QR_VERSION, encodeTicketQr } from '@/shared/tickets/qr';
import { TransferTicket } from '@/frontend/components/tickets/TransferTicket';
import { ChangeSeat } from '@/frontend/components/tickets/ChangeSeat';
import {
  ROTATION_WINDOW_SECONDS,
  computeRotationCodeInBrowser,
  millisUntilRotation,
} from '@/shared/tickets/rotating';

/**
 * The customer's ticket QR.
 *
 * Carries identifiers plus the signature written at issuance. Scanning it validates
 * entry for one specific event and never grants any account access.
 *
 * `userId` was in here and has been removed: nothing read it, and anyone who
 * photographed a ticket learned the buyer's account id for free.
 */
export function ticketQrPayload(ticket: Ticket, rotatingCode?: string) {
  return encodeTicketQr({
    v: QR_VERSION,
    t: ticket.id,
    e: ticket.eventId,
    r: ticket.reference,
    s: ticket.qrSignature,
    c: rotatingCode,
  });
}

/**
 * A code that changes every 30 seconds, computed in the browser from the ticket's seed.
 *
 * Signing alone stops a QR being forged; it does not stop the buyer photographing their
 * own ticket and forwarding it, with whoever arrives first getting in and the real
 * holder refused at the door. Rotation makes the photograph stale before it can travel.
 *
 * Computed locally rather than fetched, so the ticket still works with no signal — a
 * basement venue is exactly where a network round-trip would fail, and exactly when the
 * ticket is needed. Returns undefined without Web Crypto, and the door falls back to the
 * static signature: a ticket that renders nothing is a person at a gate with no way in,
 * which is worse than a slightly weaker code.
 */
function useRotatingCode(ticket: Ticket): { code?: string; secondsLeft: number } {
  const [code, setCode] = React.useState<string | undefined>(undefined);
  const [secondsLeft, setSecondsLeft] = React.useState(ROTATION_WINDOW_SECONDS);

  React.useEffect(() => {
    if (!ticket.rotationSeed) return;
    let cancelled = false;

    const tick = async () => {
      const next = await computeRotationCodeInBrowser(ticket.rotationSeed!, ticket.id);
      if (!cancelled) {
        setCode(next ?? undefined);
        setSecondsLeft(Math.ceil(millisUntilRotation() / 1000));
      }
    };

    void tick();
    // Every second so the countdown is honest; the code only changes on a window edge.
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ticket.rotationSeed, ticket.id]);

  return { code, secondsLeft };
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
  const rotating = useRotatingCode(ticket);

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
              value={ticketQrPayload(ticket, rotating.code)}
              size={196}
              level="M"
              includeMargin={false}
            />
          </div>

          {rotating.code && (
            <p className="text-center text-xs text-muted-foreground">
              This code refreshes in {rotating.secondsLeft}s — a screenshot will not scan.
            </p>
          )}

          <p className="text-center text-xs uppercase tracking-[0.2em] text-primary">
            {ticket.organizerName}
          </p>

          {/* Only while the ticket can still be used. A redeemed ticket cannot move —
              the holder is already inside — and offering the control anyway would be a
              button that always errors. */}
          {ticket.status === 'valid' && (
            <div className="space-y-2">
              <TransferTicket ticket={ticket} />
              {/* Renders nothing for general admission, which is most events. */}
              <ChangeSeat ticket={ticket} />
            </div>
          )}

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
