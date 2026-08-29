'use client';

import * as React from 'react';
import { Radio, Users } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { authedFetch } from '@/frontend/lib/authed-fetch';

interface Pulse {
  admitted: number;
  issued: number;
  recent: Array<{ reference: string; at: string; tier: string; gate?: string }>;
}

/**
 * Live cross-door admissions, for the check-in portal.
 *
 * Polls `/api/check-in/pulse` every few seconds so every door sees the running admitted
 * count and the latest entries from *all* gates, not just its own. Polling rather than a
 * live socket keeps it working on flaky venue wifi and needs no extra service; a failed
 * poll is silent and the previous figures stay on screen, because a door with a blank panel
 * is worse than a door with a number a few seconds stale.
 */
export function LiveAdmissions({ eventId }: { eventId: string }) {
  const [pulse, setPulse] = React.useState<Pulse | null>(null);
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await authedFetch(`/api/check-in/pulse?eventId=${encodeURIComponent(eventId)}`);
        if (res.ok) {
          const data = (await res.json()) as Pulse;
          if (!cancelled) {
            setPulse(data);
            setLive(true);
          }
        } else if (!cancelled) {
          setLive(false);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId]);

  if (!pulse) return null;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Admitted across all doors
          <span
            className={`ml-auto inline-flex items-center gap-1 text-xs ${live ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Radio className={`h-3 w-3 ${live ? 'animate-pulse' : ''}`} /> {live ? 'Live' : 'Reconnecting…'}
          </span>
        </CardTitle>
        <CardDescription>
          <span className="font-headline text-2xl font-bold text-foreground tabular-nums">
            {pulse.admitted.toLocaleString()}
          </span>{' '}
          in{pulse.issued > 0 ? ` of ${pulse.issued.toLocaleString()} issued` : ''} — every gate, in real time.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {pulse.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admissions yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {pulse.recent.map((r) => (
              <li key={`${r.reference}-${r.at}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                  {r.tier ? <span className="ml-2 text-muted-foreground">{r.tier}</span> : null}
                  {r.gate ? <span className="ml-2 text-xs text-muted-foreground">· {r.gate}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{time(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
