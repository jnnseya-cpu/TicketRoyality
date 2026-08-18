'use client';

import * as React from 'react';
import { Gavel, Loader2, Plus } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import type { Event } from '@/shared/types';

interface LotView {
  id: string;
  title: string;
  currency: string;
  startMinor: number;
  highBidMinor: number;
  bidCount: number;
  closesAt: string;
  status: string;
  reserve: 'none' | 'met' | 'not-met';
}

/**
 * Putting lots into an auction, and watching them run.
 *
 * Lots live on an event rather than standing alone: a charity auction happens at a gala,
 * and tying it to the event is what gives it a room, a guest list and a closing time that
 * mean something. The event picker is therefore the first control, not a detail.
 */
export function AuctionLotManager({ organiserId }: { organiserId: string }) {
  const { toast } = useToast();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [eventId, setEventId] = React.useState('');
  const [lots, setLots] = React.useState<LotView[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [draft, setDraft] = React.useState({
    title: '',
    description: '',
    start: '50',
    increment: '10',
    reserve: '',
    closesAt: '',
    extendMinutes: '2',
  });

  React.useEffect(() => {
    void getEventsByOrganizer(organiserId)
      .then((list) => {
        setEvents(list);
        setEventId((current) => current || (list[0]?.id ?? ''));
      })
      .catch(() => undefined);
  }, [organiserId]);

  const load = React.useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const response = await authedFetch(`/api/auctions?eventId=${encodeURIComponent(eventId)}`);
      const data = (await response.json()) as { lots?: LotView[] };
      setLots(data.lots ?? []);
    } catch {
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!eventId || !draft.title.trim() || !draft.closesAt) {
      toast({
        variant: 'destructive',
        title: 'Not enough to open a lot',
        description: 'A lot needs an event, a title and a closing time.',
      });
      return;
    }

    setSaving(true);
    try {
      const response = await authedFetch('/api/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          eventId,
          title: draft.title,
          description: draft.description || undefined,
          startMinor: Math.round(Number(draft.start) * 100),
          incrementMinor: Math.round(Number(draft.increment) * 100),
          reserveMinor: draft.reserve ? Math.round(Number(draft.reserve) * 100) : undefined,
          // A local datetime becomes an instant here, so a lot closes when the organiser
          // meant rather than an hour out for half the year.
          closesAt: new Date(draft.closesAt).toISOString(),
          extendMinutes: Number(draft.extendMinutes) || 0,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Lot not created', description: data.error });
        return;
      }

      toast({ title: 'Lot open for bidding', description: draft.title });
      setDraft({ ...draft, title: '', description: '', reserve: '' });
      await load();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Lot not created',
        description: 'We could not reach the server.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-primary" /> Auction lots
        </CardTitle>
        <CardDescription>
          Lots close on their own clock — nobody has to remember to press a button. A late
          bid pushes the close out so the lot ends when the bidding ends. A winning bid buys
          goods, so no Gift Aid is claimed on it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-1">
          <Label className="text-xs">Event</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Lot</Label>
            <Input
              placeholder="Signed shirt"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              placeholder="What it is, and anything a bidder should know before bidding."
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bidding starts at</Label>
            <Input
              type="number"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Increment</Label>
            <Input
              type="number"
              value={draft.increment}
              onChange={(e) => setDraft({ ...draft, increment: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reserve (optional)</Label>
            <Input
              type="number"
              placeholder="Not disclosed to bidders"
              value={draft.reserve}
              onChange={(e) => setDraft({ ...draft, reserve: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Closes</Label>
            <Input
              type="datetime-local"
              value={draft.closesAt}
              onChange={(e) => setDraft({ ...draft, closesAt: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Extend on a late bid (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={draft.extendMinutes}
              onChange={(e) => setDraft({ ...draft, extendMinutes: e.target.value })}
            />
          </div>

          <div className="flex items-end sm:col-span-2">
            <Button type="button" variant="royal" disabled={saving} onClick={() => void create()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Open this lot
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lots on this event yet.</p>
        ) : (
          <div className="space-y-2">
            {lots.map((lot) => (
              <div
                key={lot.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <span className="font-medium">{lot.title}</span>
                <span className="tabular-nums">
                  {lot.highBidMinor > 0
                    ? `${formatCurrency(lot.highBidMinor / 100, lot.currency)} · ${lot.bidCount} bid${lot.bidCount === 1 ? '' : 's'}`
                    : `no bids · from ${formatCurrency(lot.startMinor / 100, lot.currency)}`}
                  {lot.reserve === 'not-met' && ' · reserve not met'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lot.status === 'open' ? 'closes' : lot.status} {new Date(lot.closesAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
