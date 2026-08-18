'use client';

import * as React from 'react';
import { Gift, Loader2, Plus } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import type { Event } from '@/shared/types';

interface ItemView {
  id: string;
  title: string;
  currency: string;
  targetMinor: number;
  raisedMinor: number;
  remainingMinor: number;
  contributionCount: number;
}

interface ContributionView {
  id: string;
  itemId: string;
  amountMinor: number;
  giverName: string;
  giverEmail: string;
  message?: string;
  at: string;
}

/**
 * The gift list, from the couple's side.
 *
 * The contributions list is the part that earns its place: it is the thank-you letters.
 * A registry that shows a running total and not who gave leaves somebody to reconstruct
 * it from a bank statement.
 */
export function RegistryManager({ organiserId }: { organiserId: string }) {
  const { toast } = useToast();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [eventId, setEventId] = React.useState('');
  const [items, setItems] = React.useState<ItemView[]>([]);
  const [contributions, setContributions] = React.useState<ContributionView[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: '', target: '100', allowPartial: true });

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
    try {
      const [listed, given] = await Promise.all([
        fetch(`/api/registry?eventId=${encodeURIComponent(eventId)}`, { cache: 'no-store' }).then((r) =>
          r.json()
        ),
        authedFetch('/api/registry?view=contributions').then((r) => r.json()),
      ]);
      setItems((listed as { items?: ItemView[] }).items ?? []);
      setContributions((given as { contributions?: ContributionView[] }).contributions ?? []);
    } catch {
      setItems([]);
    }
  }, [eventId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!eventId || !draft.title.trim()) {
      toast({ variant: 'destructive', title: 'A gift needs an event and a name' });
      return;
    }

    setSaving(true);
    try {
      const response = await authedFetch('/api/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          title: draft.title,
          targetMinor: Math.round(Number(draft.target) * 100),
          allowPartial: draft.allowPartial,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Gift not added', description: data.error });
        return;
      }

      setDraft({ ...draft, title: '' });
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Gift not added' });
    } finally {
      setSaving(false);
    }
  };

  const titleOf = (itemId: string) => items.find((i) => i.id === itemId)?.title ?? 'a gift';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-primary" /> Gift list
        </CardTitle>
        <CardDescription>
          Guests give towards what is on the list. We charge no fee on a gift. A present is
          not a charitable donation, so Gift Aid never applies to it.
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

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Gift</Label>
            <Input
              className="w-56"
              placeholder="Stand mixer"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cost</Label>
            <Input
              type="number"
              className="w-28"
              value={draft.target}
              onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs">
            <Checkbox
              checked={draft.allowPartial}
              onCheckedChange={(v) => setDraft({ ...draft, allowPartial: v === true })}
            />
            {/* Part payments are how a big item gets bought at all. */}
            Allow part payments
          </label>
          <Button type="button" variant="royal" size="sm" disabled={saving} onClick={() => void add()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <span className="font-medium">{item.title}</span>
                <span className="tabular-nums">
                  {formatCurrency(item.raisedMinor / 100, item.currency)} of{' '}
                  {formatCurrency(item.targetMinor / 100, item.currency)}
                  {item.remainingMinor <= 0 ? ' · bought' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {contributions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium">Who gave what</p>
            {contributions.slice(0, 25).map((c) => (
              <div key={c.id} className="rounded-md border border-border p-2 text-xs">
                <span className="font-medium">{c.giverName}</span> —{' '}
                {formatCurrency(c.amountMinor / 100)} towards {titleOf(c.itemId)}
                {c.message && <p className="mt-1 italic text-muted-foreground">“{c.message}”</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
