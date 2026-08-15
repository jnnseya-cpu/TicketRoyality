'use client';

import * as React from 'react';
import { AlertTriangle, Check, Loader2, Send, ShieldAlert } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { DeliveryLog } from '@/frontend/components/dashboard/DeliveryLog';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { COMMS_CATALOGUE, CHANNELS, catalogueStats, render } from '@/shared/comms';
import type { Channel, CommsEvent, Severity } from '@/shared/comms/types';

// The badge primitive has no `warning` variant; `gold` carries the same weight in
// this design system without adding a one-off variant for a single console.
const SEVERITY_VARIANT: Record<Severity, 'secondary' | 'success' | 'gold' | 'destructive'> = {
  info: 'secondary',
  success: 'success',
  warning: 'gold',
  critical: 'destructive',
};

const PREVIEW_VARS = {
  event: 'Kinshasa Nights',
  amount: '£45.00',
  acu: 100,
  actor: 'Groupe Nseya',
  item: 'VIP Table',
  number: 'TR-8F3K2M',
  date: '14 March',
  time: '19:00',
  gate: 'East 3',
  percent: '80%',
  code: '482913',
  hours: '48',
  recipient: 'a friend',
};

interface TestResult {
  subject: string;
  attempted: Channel[];
  suppressed: Channel[];
  records: Array<{ id: string; channel: Channel; status: string; provider: string }>;
}

function Console() {
  const stats = React.useMemo(() => catalogueStats(), []);
  const [selected, setSelected] = React.useState<CommsEvent | null>(null);
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const [logKey, setLogKey] = React.useState(0);
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fire = async (event: CommsEvent) => {
    setSelected(event);
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await authedFetch('/api/comms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: event.key, email: email || undefined, live }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Dispatch failed');
      setResult(data as TestResult);
      // Nudge the log to refetch so a send appears immediately rather than on the next
      // manual refresh — the whole point of the log is answering "did that go out?".
      setLogKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container py-10">
      <h1 className="font-headline text-3xl font-bold">Communication architecture</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        One event engine. Every message the platform can send is declared once here with
        its channels, severity and opt-out status — nothing sends an ad-hoc message.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Catalogue events', value: stats.events, sub: `${stats.categories} categories` },
          { label: 'Mandatory notices', value: stats.mandatory, sub: 'bypass opt-outs' },
          { label: 'Channels wired', value: CHANNELS.length, sub: CHANNELS.join(' · ') },
          { label: 'Critical severity', value: stats.bySeverity.critical, sub: 'page a human' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 font-headline text-3xl font-bold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DeliveryLog refreshToken={logKey} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Channel coverage</CardTitle>
          <CardDescription>
            How many catalogue events fire on each channel by default
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CHANNELS.map((channel) => (
            <div key={channel} className="rounded-lg border border-border p-3">
              <p className="font-mono text-xs uppercase text-primary">{channel}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.byChannel[channel]}</p>
              <p className="text-xs text-muted-foreground">events</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Template QA</CardTitle>
          <CardDescription>
            Fire any event to yourself across its channels. Sandbox unless a provider key
            is set, so the flow is always testable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-sm"
            />
            {/*
              Sandbox is the default and has to be turned off deliberately. The failure
              mode of a test console that really sends is a test that reaches a customer.
            */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={live ? 'destructive' : 'outline'}
                onClick={() => setLive((value) => !value)}
                aria-pressed={live}
              >
                {live ? 'Live send — really delivers' : 'Sandbox — records only'}
              </Button>
            </div>
          </div>
          {live && !email && (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              A live send needs an address.
            </p>
          )}
          {selected && (
            <div className="rounded-lg border border-border bg-card/50 p-4">
              <p className="font-mono text-xs text-muted-foreground">{selected.key}</p>
              <p className="mt-1 font-semibold">{render(selected.subject, PREVIEW_VARS)}</p>
              {sending && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Dispatching…
                </p>
              )}
              {error && (
                <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </p>
              )}
              {result && (
                <ul className="mt-3 space-y-1">
                  {result.records.map((record) => (
                    <li key={record.id} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono text-xs">{record.channel}</span>
                      <span className="text-muted-foreground">
                        {record.status} · {record.provider}
                      </span>
                    </li>
                  ))}
                  {result.suppressed.length > 0 && (
                    <li className="text-xs text-muted-foreground">
                      suppressed: {result.suppressed.join(', ')}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-10 space-y-10">
        {COMMS_CATALOGUE.map((category) => (
          <section key={category.id}>
            <div className="mb-1 flex items-baseline gap-3">
              <h2 className="font-headline text-xl font-bold">{category.label}</h2>
              <span className="text-sm text-muted-foreground">
                {category.events.length} events
              </span>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
              {category.description}
            </p>

            <div className="grid gap-3 lg:grid-cols-2">
              {category.events.map((event) => (
                <div
                  key={event.key}
                  className="rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{event.label}</span>
                        {event.mandatory && (
                          <Badge variant="gold" className="gap-1 text-[10px]">
                            <ShieldAlert className="h-3 w-3" /> mandatory
                          </Badge>
                        )}
                        <Badge variant={SEVERITY_VARIANT[event.severity]} className="text-[10px]">
                          {event.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{event.key}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {render(event.subject, PREVIEW_VARS)}
                      </p>
                      {event.note && (
                        <p className="mt-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
                          {event.note}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.channels.map((channel) => (
                          <span
                            key={channel}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground"
                          >
                            {channel}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => fire(event)}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CommsConsole() {
  return <RequireRole role="superuser">{() => <Console />}</RequireRole>;
}
