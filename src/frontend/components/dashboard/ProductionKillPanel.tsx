'use client';

import * as React from 'react';
import { Construction, Loader2, MoveRight } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Textarea } from '@/frontend/components/ui/textarea';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useToast } from '@/frontend/hooks/use-toast';
import { expandSeatList } from '@/shared/seating';

interface CaseView {
  caseId: string;
  seat: string;
  attendeeName: string;
  suggestedSeat?: string;
}

/**
 * Production kills — docs/25 §43–44. "The rig lands where row Q was."
 *
 * Type the seats the way a stage manager writes them (B12-B15, Q1-Q20), press Kill:
 * unsold seats leave sale instantly; sold seats become the queue below, each with a
 * fresh same-tier suggestion, moved one press at a time through the same box-office
 * move everything else uses. The holder is emailed when their seat moves. Nothing is
 * ever silently invalidated — the one rule the whole feature exists to keep.
 */
export function ProductionKillPanel({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const [seatsText, setSeatsText] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [cases, setCases] = React.useState<CaseView[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [targets, setTargets] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      const response = await authedFetch(`/api/events/${eventId}/production-kill`);
      const data = (await response.json()) as { cases?: CaseView[] };
      setCases(data.cases ?? []);
    } catch {
      setCases([]);
    }
  }, [eventId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const kill = async () => {
    const seats = expandSeatList(seatsText);
    if (seats.length === 0) return;
    setBusy('kill');
    try {
      const response = await authedFetch(`/api/events/${eventId}/production-kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats, reason: reason || 'production' }),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: { blocked: string[]; cases: unknown[]; alreadyInside: string[]; unknown: string[] };
      };
      if (!response.ok || !data.summary) throw new Error(data.error ?? 'Could not apply.');

      const s = data.summary;
      toast({
        title: 'Kill applied',
        description: [
          `${s.blocked.length} blocked from sale`,
          `${s.cases.length} sold — now in the reseat queue`,
          s.alreadyInside.length ? `${s.alreadyInside.length} already inside (speak to stewards)` : '',
          s.unknown.length ? `Unknown: ${s.unknown.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
      setSeatsText('');
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Kill not applied',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (item: CaseView) => {
    const toSeat = (targets[item.caseId] ?? item.suggestedSeat ?? '').trim();
    if (!toSeat) return;
    setBusy(item.caseId);
    try {
      const response = await authedFetch(`/api/events/${eventId}/production-kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', caseId: item.caseId, toSeat }),
      });
      const data = (await response.json()) as { error?: string; seat?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not move them.');
      toast({
        title: `${item.attendeeName} moved to ${data.seat}`,
        description: 'They have been emailed. Their ticket and code are unchanged.',
      });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Not moved',
        description: error instanceof Error ? error.message : 'Try another seat.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="h-4 w-4 text-primary" /> Production kill
        </CardTitle>
        <CardDescription>
          Take seats out of use — a rig, a camera, a stage extension. Unsold seats leave
          sale instantly; sold seats queue below for reseating, and nobody is ever
          silently invalidated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-2">
          <Textarea
            rows={2}
            className="min-w-[16rem] flex-1"
            placeholder="Q1-Q20, R4 R5, B12-B15"
            value={seatsText}
            onChange={(event) => setSeatsText(event.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Reason (goes in the holder's email)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy === 'kill' || expandSeatList(seatsText).length === 0}
              onClick={() => void kill()}
            >
              {busy === 'kill' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kill {expandSeatList(seatsText).length || ''} seats
            </Button>
          </div>
        </div>

        {cases.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reseat queue ({cases.length})
            </p>
            {cases.map((item) => (
              <div key={item.caseId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-14 font-medium tabular-nums">{item.seat}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.attendeeName}
                </span>
                <MoveRight className="h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 w-24"
                  placeholder={item.suggestedSeat ?? 'seat'}
                  value={targets[item.caseId] ?? ''}
                  onChange={(event) =>
                    setTargets((current) => ({ ...current, [item.caseId]: event.target.value }))
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === item.caseId || !((targets[item.caseId] ?? item.suggestedSeat)?.trim())}
                  onClick={() => void resolve(item)}
                >
                  {busy === item.caseId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Move'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
