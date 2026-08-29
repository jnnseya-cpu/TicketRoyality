'use client';

import * as React from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
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
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { cn, formatCurrency } from '@/shared/utils';
import type { Event, SeasonPass, UserProfile } from '@/shared/types';

/**
 * Season passes: choose the run, choose which ticket type the pass takes in each fixture,
 * name a price.
 *
 * The per-fixture tier is not a detail to hide behind a default. It is what makes a pass
 * consume real inventory, so twenty pass holders are twenty seats gone from every night —
 * counted exactly like single tickets, rather than a number nobody added up until the
 * room was full.
 */
function Passes({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [passes, setPasses] = React.useState<SeasonPass[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [quantity, setQuantity] = React.useState('100');
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [tierIds, setTierIds] = React.useState<Record<string, string>>({});
  // Automatic renewal: this pass renews an earlier one, whose holders buy first until the
  // window closes. Both empty = an ordinary pass on open sale.
  const [renewsPassId, setRenewsPassId] = React.useState('');
  const [holderWindowEnds, setHolderWindowEnds] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/season-passes');
      const data = (await response.json()) as { passes?: SeasonPass[] };
      setPasses(data.passes ?? []);
    } catch {
      setPasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    getEventsByOrganizer(profile.uid)
      .then((all) => setEvents(all.filter((e) => new Date(e.date).getTime() > Date.now())))
      .catch(() => setEvents([]));
  }, [load, profile.uid]);

  const toggleEvent = (event: Event) => {
    setChosen((current) =>
      current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id]
    );
    setTierIds((current) => ({
      ...current,
      // A sensible default so the common case is one click, still overridable.
      [event.id]: current[event.id] ?? event.ticketTiers[0]?.id ?? '',
    }));
  };

  const currency = events[0]?.currency ?? 'GBP';
  const quote = price ? computeOrderFees([{ faceMinor: toMinor(Number(price) || 0), qty: 1 }]) : null;

  const create = async () => {
    setSaving(true);
    try {
      const response = await authedFetch('/api/season-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          price: Number(price),
          currency,
          quantity: Number(quantity),
          eventIds: chosen,
          tierIds,
          // Only sent as a pair; the server ignores one without the other.
          ...(renewsPassId && holderWindowEnds
            ? { renewsPassId, holderWindowEnds: new Date(holderWindowEnds).toISOString() }
            : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not create that pass.');

      setName('');
      setDescription('');
      setPrice('');
      setChosen([]);
      setRenewsPassId('');
      setHolderWindowEnds('');
      toast({ title: 'Season pass created', description: `${chosen.length} fixtures covered.` });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create that pass',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Season passes</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One purchase covering a run of fixtures. A pass issues a real ticket for every event
          it covers, so the door, the seat map and your capacity all work exactly as they
          already do — and every fixture counts its pass holders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" /> New pass
          </CardTitle>
          <CardDescription>
            {chosen.length === 0
              ? 'Choose the fixtures it covers.'
              : `${chosen.length} fixtures selected.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pass-name">Name</Label>
              <Input
                id="pass-name"
                value={name}
                placeholder="2026/27 Season Ticket"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pass-price">Price ({currency})</Label>
              <Input
                id="pass-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {quote && (
                <p className="text-xs text-muted-foreground">
                  A buyer pays {formatCurrency(toMajor(quote.buyerTotalMinor), currency)} all in.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pass-qty">How many passes</Label>
              <Input
                id="pass-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pass-desc">Description (optional)</Label>
            <Textarea
              id="pass-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {passes.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div>
                <Label>Renews an earlier pass (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Last season&apos;s holders can buy first. Until the window closes, only people
                  who bought the pass below may buy this one — enforced at checkout, not just hidden.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={renewsPassId} onValueChange={setRenewsPassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No renewal — open to everyone" />
                  </SelectTrigger>
                  <SelectContent>
                    {passes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <Input
                    type="datetime-local"
                    value={holderWindowEnds}
                    disabled={!renewsPassId}
                    onChange={(e) => setHolderWindowEnds(e.target.value)}
                    aria-label="Holder-first window ends"
                  />
                  <p className="text-xs text-muted-foreground">Opens to everyone after this.</p>
                </div>
              </div>
              {renewsPassId && !holderWindowEnds && (
                <p className="text-xs text-destructive">
                  Set when the holder-first window ends, or clear the pass above.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Fixtures covered</Label>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming events to cover yet.
              </p>
            ) : (
              events.map((event) => {
                const selected = chosen.includes(event.id);
                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-md border p-3',
                      selected ? 'border-primary/50 bg-primary/5' : 'border-border'
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => toggleEvent(event)}
                    >
                      <p className="truncate text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </button>

                    {selected && (
                      <Select
                        value={tierIds[event.id] ?? ''}
                        onValueChange={(v) => setTierIds((c) => ({ ...c, [event.id]: v }))}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Takes which ticket type?" />
                        </SelectTrigger>
                        <SelectContent>
                          {event.ticketTiers.map((tier) => (
                            <SelectItem key={tier.id} value={tier.id}>
                              {tier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <Button
            onClick={create}
            disabled={saving || !name.trim() || chosen.length === 0}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create season pass
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : passes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No season passes yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {passes.map((pass) => (
            <Card key={pass.id}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-3 text-base">
                  <span>{pass.name}</span>
                  <span className="text-primary">
                    {formatCurrency(pass.price, pass.currency)}
                  </span>
                </CardTitle>
                <CardDescription>
                  {pass.eventIds.length} fixtures · {pass.sold ?? 0} of {pass.quantity} sold
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant={pass.active ? 'gold' : 'secondary'}>
                  {pass.active ? 'On sale' : 'Paused'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PassesPage() {
  return <RequireRole role="organiser">{(profile) => <Passes profile={profile} />}</RequireRole>;
}
