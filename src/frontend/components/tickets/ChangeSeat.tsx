'use client';

import * as React from 'react';
import { ArmchairIcon, Loader2 } from 'lucide-react';

import { SeatPicker } from '@/frontend/components/events/SeatPicker';
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
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventById } from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import type { SeatingSection, Ticket } from '@/shared/types';

/**
 * Moving to a different seat, after buying.
 *
 * ## Why the same picker the buyer used
 *
 * A second seat map here would be a second thing to keep in step with the room, and the
 * two would drift the first time a section changed. Reusing the picker also means a
 * person moving seats gets the availability fetch, the held-back seats and "best
 * available" without any of it being built twice.
 *
 * The refusals are all server-side — whether this is your ticket, whether the seat is on
 * your ticket type, and whether somebody else got there first — so what this component
 * shows is a suggestion and what the API answers is the truth. A seat that goes between
 * opening this and pressing the button produces a plain sentence, not a broken page.
 */
export function ChangeSeat({ ticket }: { ticket: Ticket }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [sections, setSections] = React.useState<SeatingSection[] | null>(null);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  /*
   * docs/24 §14 — a move into a dearer tier is a purchase. The buyer picks the tier
   * they want to sit in; a seat outside their own tier gets a server quote (difference
   * plus the service fee on it), and the button says the price before anything happens.
   */
  const [targetTierId, setTargetTierId] = React.useState(ticket.tierId ?? '');
  const [quote, setQuote] = React.useState<{
    totalMinor: number;
    toTierName: string;
  } | null>(null);

  React.useEffect(() => {
    setQuote(null);
    const seat = chosen[0];
    if (!seat || targetTierId === ticket.tierId) return;
    let cancelled = false;
    void authedFetch('/api/tickets/seat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quote', ticketId: ticket.id, seat }),
    })
      .then((r) => r.json())
      .then((data: { upgrade?: boolean; totalMinor?: number; toTierName?: string; error?: string }) => {
        if (cancelled) return;
        if (data.upgrade && data.totalMinor) {
          setQuote({ totalMinor: data.totalMinor, toTierName: data.toTierName ?? '' });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chosen, targetTierId, ticket.id, ticket.tierId]);

  React.useEffect(() => {
    if (!open || sections) return;
    let cancelled = false;
    void getEventById(ticket.eventId).then((event) => {
      if (!cancelled) setSections(event?.seating ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, sections, ticket.eventId]);

  const save = async () => {
    const seat = chosen[0];
    if (!seat) return;

    setSaving(true);
    try {
      const upgrading = targetTierId !== ticket.tierId;
      const response = await authedFetch('/api/tickets/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: upgrading ? 'upgrade' : 'move',
          ticketId: ticket.id,
          seat,
        }),
      });
      const data = (await response.json()) as { error?: string; seat?: string; url?: string };

      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Seat not changed', description: data.error });
        return;
      }

      if (upgrading && data.url) {
        // The seat is held; the move lands after the payment, from the webhook.
        window.location.assign(data.url);
        return;
      }

      toast({
        title: `You are now in ${data.seat}`,
        description: 'Your ticket has been updated — the QR code is unchanged.',
      });
      setOpen(false);
      // The ticket in this page's props is now stale in one field, and the honest fix is
      // to re-read it rather than patch a copy that other views do not share.
      window.location.reload();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Seat not changed',
        description: 'We could not reach the server. Nothing has moved.',
      });
    } finally {
      setSaving(false);
    }
  };

  // General admission has nothing to move to, and a used ticket is already inside.
  if (!ticket.seat || ticket.status !== 'valid' || !ticket.tierId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <ArmchairIcon className="h-4 w-4" /> Change seat
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change your seat</DialogTitle>
          <DialogDescription>
            You are in {ticket.seat}. A seat on your own ticket type — {ticket.tierName} — is a
            free move. A seat on a better type shows the price difference before you decide;
            moving to a cheaper type is a refund and a new booking.
          </DialogDescription>
        </DialogHeader>

        {sections === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : sections.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This event does not have a seat map.
          </p>
        ) : (
          <>
            {(() => {
              const tierIds = [...new Set(sections.map((s) => s.tierId).filter(Boolean))] as string[];
              if (tierIds.length <= 1) return null;
              return (
                <div className="flex flex-wrap gap-2">
                  {tierIds.map((id) => {
                    const name = sections.find((s) => s.tierId === id)?.name ?? id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setTargetTierId(id);
                          setChosen([]);
                        }}
                        className={
                          id === targetTierId
                            ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary'
                            : 'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground'
                        }
                      >
                        {name}
                        {id === ticket.tierId ? ' (yours)' : ''}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <SeatPicker
              eventId={ticket.eventId}
              sections={sections}
              tierId={targetTierId || ticket.tierId!}
              quantity={1}
              selected={chosen}
              onChange={setChosen}
            />
          </>
        )}

        <DialogFooter>
          <Button variant="royal" disabled={!chosen[0] || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {!chosen[0]
              ? 'Choose a seat'
              : targetTierId !== ticket.tierId
                ? quote
                  ? `Upgrade to ${chosen[0]} — pay ${formatCurrency(quote.totalMinor / 100, ticket.currency)}`
                  : `Checking price for ${chosen[0]}…`
                : `Move to ${chosen[0]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
