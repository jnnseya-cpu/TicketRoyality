'use client';

import * as React from 'react';
import { Check, Copy, Loader2, Store } from 'lucide-react';

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
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { BoxOfficeSell } from '@/frontend/components/dashboard/BoxOfficeSell';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { describeError } from '@/shared/errors';
import { toMajor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';
import type { BoxOfficeSale, Event, UserProfile } from '@/shared/types';

function BoxOffice({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [selected, setSelected] = React.useState('');
  const [sales, setSales] = React.useState<BoxOfficeSale[]>([]);
  const [owed, setOwed] = React.useState<Record<string, number>>({});
  const [pin, setPin] = React.useState('');
  const [armed, setArmed] = React.useState(false);
  const [savingPin, setSavingPin] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const event = events.find((e) => e.id === selected);
  const staffLink = event ? `${typeof window !== 'undefined' ? window.location.origin : ''}/events/${event.id}/box-office` : '';

  const loadSales = React.useCallback(async () => {
    try {
      const res = await authedFetch('/api/box-office/sales');
      const data = (await res.json()) as { sales?: BoxOfficeSale[]; owed?: Record<string, number> };
      setSales(data.sales ?? []);
      setOwed(data.owed ?? {});
    } catch {
      /* leave prior state */
    }
  }, []);

  React.useEffect(() => {
    getEventsByOrganizer(profile.uid)
      .then((list) => {
        setEvents(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
    void loadSales();
  }, [profile.uid, loadSales]);

  React.useEffect(() => {
    if (!selected) return;
    authedFetch(`/api/box-office/pin?eventId=${selected}`)
      .then((r) => r.json())
      .then((d: { armed?: boolean }) => setArmed(Boolean(d.armed)))
      .catch(() => setArmed(false));
  }, [selected]);

  const savePin = async () => {
    if (!event) return;
    setSavingPin(true);
    try {
      const res = await authedFetch('/api/box-office/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, pin }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not set the PIN.');
      setArmed(true);
      setPin('');
      toast({ title: 'Door PIN set', description: 'Share the staff link and this PIN with your gate team.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Not saved', description: describeError(error) });
    } finally {
      setSavingPin(false);
    }
  };

  const refund = async (saleId: string) => {
    try {
      const res = await authedFetch('/api/box-office/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Refund failed.');
      toast({ title: 'Refunded', description: 'Hand the cash back to the buyer. Inventory returned.' });
      void loadSales();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Not refunded', description: describeError(error) });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-headline text-2xl font-bold">
          <Store className="h-6 w-6 text-primary" /> Box office
        </h1>
        <p className="text-sm text-muted-foreground">
          Sell tickets at the door — cash, card or mobile money. Each is a real, counted,
          scannable ticket at the same price as online. You collect the money; the service
          fee is recorded as owed and deducted at payout.
        </p>
      </div>

      {Object.keys(owed).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Service fee owed from door sales</CardTitle>
            <CardDescription>Deducted from your next payout.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {Object.entries(owed).map(([cur, minor]) => (
              <span key={cur} className="font-headline text-2xl font-bold text-primary">
                {formatCurrency(toMajor(minor), cur)}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        <Label>Event</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {event && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sell a ticket</CardTitle>
              <CardDescription>{event.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <BoxOfficeSell eventId={event.id} currency={event.currency} tiers={event.ticketTiers} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gate-staff link</CardTitle>
              <CardDescription>
                Let staff sell without your login. They open the link and enter this PIN.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pin">{armed ? 'Change the door PIN' : 'Set a door PIN'}</Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="At least 4 characters"
                  />
                </div>
                <Button onClick={savePin} disabled={savingPin || pin.trim().length < 4}>
                  {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              {armed && (
                <div className="space-y-1.5">
                  <Label>Staff link</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={staffLink} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(staffLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A PIN is set. The link only sells with the current PIN — change it to revoke.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Door sales</CardTitle>
          <CardDescription>Refunding hands the cash back and returns the ticket to inventory.</CardDescription>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No door sales yet.</p>
          ) : (
            <div className="space-y-2">
              {sales.slice(0, 50).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {s.quantity} × {s.tierName} · {s.eventTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.tender.replace('_', ' ')} · {formatCurrency(toMajor(s.buyerTotalMinor), s.currency)} ·{' '}
                      {new Date(s.createdAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                  {s.status === 'refunded' ? (
                    <Badge variant="secondary">Refunded</Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => refund(s.id)}>
                      Refund
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BoxOfficePage() {
  return <RequireRole role="organiser">{(profile) => <BoxOffice profile={profile} />}</RequireRole>;
}
