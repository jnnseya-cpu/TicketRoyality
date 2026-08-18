'use client';

import * as React from 'react';
import { Check, Clock, Loader2, MapPin, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getUserTickets } from '@/shared/data/repositories';
import { cn } from '@/shared/utils';
import type { Event, EventSession, Ticket } from '@/shared/types';

/**
 * The agenda, and booking a place in it.
 *
 * ## One component, two audiences
 *
 * Anyone can read the agenda — it is the main reason somebody decides a conference is
 * worth attending, so putting it behind a purchase is self-defeating. A ticket holder
 * additionally sees which sessions they have a place in and can take or release one.
 *
 * ## What the buttons do not decide
 *
 * Capacity, tier eligibility and clashes are all settled server-side inside a
 * transaction. This renders what it was told and reports what came back; a workshop that
 * fills between the page loading and the click says so on the click.
 */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function EventAgenda({ event }: { event: Event }) {
  const sessions = event.sessions ?? [];
  const { user } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [ticketId, setTicketId] = React.useState('');
  const [booked, setBooked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    getUserTickets(user.uid)
      .then((all) => {
        const mine = all.filter((t) => t.eventId === event.id && t.status !== 'refunded');
        setTickets(mine);
        setTicketId((current) => current || mine[0]?.id || '');
      })
      .catch(() => setTickets([]));
  }, [user, event.id]);

  const loadAgenda = React.useCallback(async () => {
    if (!ticketId) return;
    try {
      const response = await authedFetch(`/api/sessions?ticketId=${encodeURIComponent(ticketId)}`);
      const data = (await response.json()) as { sessionIds?: string[] };
      setBooked(data.sessionIds ?? []);
    } catch {
      setBooked([]);
    }
  }, [ticketId]);

  React.useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  if (sessions.length === 0) return null;

  const act = async (session: EventSession, action: 'register' | 'cancel') => {
    if (!ticketId) return;
    setBusy(session.id);
    try {
      const response = await authedFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, eventId: event.id, sessionId: session.id, ticketId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'That did not work.');

      toast({
        title: action === 'register' ? 'Place reserved' : 'Place released',
        description: session.title,
      });
      await loadAgenda();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: action === 'register' ? 'Could not reserve that place' : 'Could not release it',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  // Grouped by day, then ordered by start. An agenda that is not in time order is a list.
  const days = new Map<string, EventSession[]>();
  for (const session of [...sessions].sort((a, b) => a.start.localeCompare(b.start))) {
    const key = dayKey(session.start);
    days.set(key, [...(days.get(key) ?? []), session]);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-headline text-xl font-semibold">Agenda</h2>

        {tickets.length > 1 && (
          <Select value={ticketId} onValueChange={setTicketId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tickets.map((ticket) => (
                <SelectItem key={ticket.id} value={ticket.id}>
                  {ticket.attendeeName} — {ticket.reference}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-6">
        {[...days.entries()].map(([day, items]) => (
          <div key={day} className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{day}</p>

            {items.map((session) => {
              const mine = booked.includes(session.id);
              const registered = session.registered ?? 0;
              const full = session.capacity !== null && registered >= session.capacity && !mine;

              return (
                <Card key={session.id} className={cn(mine && 'border-primary/50 bg-primary/5')}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{session.title}</span>
                        {session.track && <Badge variant="secondary">{session.track}</Badge>}
                        {mine && (
                          <Badge variant="gold" className="gap-1">
                            <Check className="h-3 w-3" /> Booked
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeLabel(session.start)} – {timeLabel(session.end)}
                        </span>
                        {session.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.location}
                          </span>
                        )}
                        {session.capacity !== null && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {Math.max(0, session.capacity - registered)} of {session.capacity} left
                          </span>
                        )}
                        {session.speakerNames && session.speakerNames.length > 0 && (
                          <span>{session.speakerNames.join(', ')}</span>
                        )}
                      </div>

                      {session.description && (
                        <p className="mt-2 text-sm text-muted-foreground">{session.description}</p>
                      )}
                    </div>

                    {/* Only a capped session is bookable. A keynote is on the agenda and
                        needs nothing reserved, so offering a button would be theatre. */}
                    {session.capacity !== null && ticketId && (
                      <Button
                        variant={mine ? 'outline' : 'royal'}
                        size="sm"
                        disabled={busy === session.id || (full && !mine)}
                        onClick={() => act(session, mine ? 'cancel' : 'register')}
                      >
                        {busy === session.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mine ? 'Release place' : full ? 'Full' : 'Reserve a place'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      {sessions.some((s) => s.capacity !== null) && !user && (
        <p className="mt-3 text-xs text-muted-foreground">
          Some sessions have limited places. Sign in with your ticket to reserve one.
        </p>
      )}
    </section>
  );
}
