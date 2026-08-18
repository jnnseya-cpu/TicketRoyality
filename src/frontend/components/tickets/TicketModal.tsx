'use client';

import * as React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Award, Download, Printer } from 'lucide-react';

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
import { getEventById, getEvents } from '@/shared/data/repositories';
import type { Event, Ticket } from '@/shared/types';
import { QR_VERSION, encodeTicketQr } from '@/shared/tickets/qr';
import { authedFetch } from '@/frontend/lib/authed-fetch';
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
  const [open, setOpen] = React.useState(false);

  /*
   * The event behind the ticket, for its main picture. Fetched on open rather than
   * stored on the ticket: every ticket already issued gets the branding too, and an
   * organiser who swaps their artwork sees the ticket follow without a migration.
   */
  const [event, setEvent] = React.useState<Event | null>(null);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getEventById(ticket.eventId)
      .then((found) => {
        if (!cancelled) setEvent(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, ticket.eventId]);

  /*
   * Three upcoming events for the printed ticket's footer — the paper in someone's
   * pocket is the cheapest advert the platform owns. Ranked by the AI recommender when
   * it answers, by shared category otherwise; never this event, never the past. Screen
   * users already have the whole site, so the block is print-only.
   */
  const [suggested, setSuggested] = React.useState<Event[]>([]);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      const all = await getEvents();
      const upcoming = all.filter(
        (e) => e.id !== ticket.eventId && new Date(e.date).getTime() > Date.now()
      );
      if (upcoming.length === 0) return;

      const fallback = [...upcoming].sort((a, b) => {
        const aScore = a.category === event?.category ? 0 : 1;
        const bScore = b.category === event?.category ? 0 : 1;
        return aScore - bScore || a.date.localeCompare(b.date);
      });

      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'recommend',
            input: {
              interests: `events like ${ticket.eventTitle}`,
              max: 3,
              events: upcoming.slice(0, 40).map((e) => ({
                id: e.id,
                title: e.title,
                category: e.category,
                location: e.location,
                date: e.date,
              })),
            },
          }),
        });
        const data = (await response.json()) as { eventIds?: string[] };
        const picks = (data.eventIds ?? [])
          .map((id) => upcoming.find((e) => e.id === id))
          .filter((e): e is Event => Boolean(e));
        if (!cancelled) setSuggested((picks.length > 0 ? picks : fallback).slice(0, 3));
      } catch {
        if (!cancelled) setSuggested(fallback.slice(0, 3));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, ticket.eventId, ticket.eventTitle, event?.category]);

  const handleDownload = () => {
    const canvas = printRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ticketroyality-${ticket.reference}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          {/* The event's own artwork, on screen and on paper — a ticket is the event's
              face, not a database printout. Plain <img>: next/image would proxy the
              organiser's Storage URL through the app for no gain on a one-off render. */}
          {event?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl}
              alt={ticket.eventTitle}
              className="h-32 w-full rounded-lg object-cover"
            />
          ) : null}

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

          {/*
            The other side of "a redeemed ticket cannot move": once they are inside, the
            ticket becomes proof they attended, and that proof has an audience — an
            employer, a CPD assessor — who has no account here. The link this mints
            verifies for whoever it is shown to.
          */}
          {ticket.status === 'redeemed' && <CertificateLink ticketId={ticket.id} />}

          <div className="border-t border-dashed border-border pt-4">
            <h3 className="text-center font-headline text-lg font-semibold">{ticket.eventTitle}</h3>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="Attendee" value={ticket.attendeeName} />
            <Row label="Ticket ID" value={<span className="font-mono">{ticket.reference}</span>} />
            <Row
              label="Ticket type"
              value={
                ticket.attendeeType ? `${ticket.tierName} — ${ticket.attendeeType}` : ticket.tierName
              }
            />
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
                    ? // A £0 ticket saying "Paid" reads like a billing error to the
                      // person holding it and to the steward reading over their shoulder.
                      ticket.price === 0
                      ? 'Free · Valid'
                      : 'Paid · Valid'
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

          {/*
            Paper only. The printed ticket travels — a fridge door, a jacket pocket, a
            colleague's desk — and three well-chosen events on it are the cheapest
            advertising the platform will ever buy. On screen the whole site is one tap
            away, so there it would just be noise under someone's QR code.
          */}
          {suggested.length > 0 && (
            <div className="print-only border-t border-dashed border-border pt-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                You might also like — ticketroyality.com
              </p>
              {suggested.map((pick) => (
                <p key={pick.id} className="mt-1 text-[11px]">
                  <span className="font-medium">{pick.title}</span>
                  {' — '}
                  {formatEventDate(pick.date)} · {pick.location}
                  <br />
                  <span className="text-muted-foreground">
                    ticketroyality.com/events/{pick.id}
                  </span>
                </p>
              ))}
            </div>
          )}
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

/** Mints and opens the shareable certificate page for an attended ticket. */
function CertificateLink({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch(
        `/api/tickets/certificate?ticketId=${encodeURIComponent(ticketId)}`
      );
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Not available.');
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not available.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" className="w-full" onClick={open} disabled={busy}>
        <Award className="h-4 w-4" /> Certificate of attendance
      </Button>
      {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
