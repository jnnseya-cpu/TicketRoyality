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
      const response = await authedFetch('/api/tickets/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', ticketId: ticket.id, seat }),
      });
      const data = (await response.json()) as { error?: string; seat?: string };

      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Seat not changed', description: data.error });
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
            You are in {ticket.seat}. Pick anything free on your ticket type — {ticket.tierName}.
            Moving to a different ticket type is a refund and a new booking, not a seat change.
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
          <SeatPicker
            eventId={ticket.eventId}
            sections={sections}
            tierId={ticket.tierId}
            quantity={1}
            selected={chosen}
            onChange={setChosen}
          />
        )}

        <DialogFooter>
          <Button variant="royal" disabled={!chosen[0] || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {chosen[0] ? `Move to ${chosen[0]}` : 'Choose a seat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
