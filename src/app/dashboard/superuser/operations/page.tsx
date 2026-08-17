'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { cn } from '@/shared/utils';

/**
 * Operations — the states that cost money if nobody looks.
 *
 * Everything on this page comes from `/STATUS.md`'s "watch after deploying" list, none
 * of which had a home in the product before. A payment could take a customer's money,
 * fail to issue a ticket, and leave no trace an operator would ever see.
 *
 * Deliberately blunt: an alert says what happened, what it means for the customer, and
 * what has to be done. A dashboard that shows a red number without saying what to do
 * with it just moves the confusion.
 */

interface Alert {
  key: string;
  label: string;
  count: number;
  health: 'ok' | 'attention' | 'urgent';
  meaning: string;
  samples: Array<{ id: string; at?: string; reason?: string; email?: string }>;
}

/**
 * Which alerts can be acted on, and how.
 *
 * `oversold` has no entry: a tier that sold out cannot be retried into existence, and
 * the recovery is a refund, which is not a button here. Money movement gets its own
 * deliberate flow rather than a one-click reversal in a console.
 */
const ACTIONS: Record<string, { action: 'retry' | 'resend'; label: string }> = {
  failed: { action: 'retry', label: 'Retry issuance' },
  stuck: { action: 'retry', label: 'Retry now' },
  delivery_failed: { action: 'resend', label: 'Resend tickets' },
  delivery_skipped: { action: 'resend', label: 'Send now' },
};

interface Report {
  generatedAt: string;
  available: boolean;
  alerts: Alert[];
  totals: { paymentEvents: number; issued: number; owedRefund: number };
}

const TONE: Record<Alert['health'], string> = {
  ok: 'border-border',
  attention: 'border-primary/50 bg-primary/5',
  urgent: 'border-destructive/60 bg-destructive/5',
};

function Operations() {
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch('/api/admin/operations');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load operations.');
      setReport(body as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load operations.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const [working, setWorking] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Record<string, string>>({});

  const act = React.useCallback(
    async (id: string, action: 'retry' | 'resend') => {
      setWorking(id);
      try {
        const response = await authedFetch('/api/admin/operations/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, id }),
        });
        const body = await response.json();
        setOutcome((prev) => ({
          ...prev,
          [id]: response.ok ? body.message : `Failed — ${body.error}`,
        }));
        // Refresh only on success. Leaving a failure on screen next to stale counts is
        // less confusing than clearing the message the operator is trying to read.
        if (response.ok) void load();
      } catch (e) {
        setOutcome((prev) => ({
          ...prev,
          [id]: e instanceof Error ? `Failed — ${e.message}` : 'Failed — could not reach the server.',
        }));
      } finally {
        setWorking(null);
      }
    },
    [load]
  );

  const urgent = report?.alerts.filter((a) => a.health === 'urgent' && a.count > 0) ?? [];
  const allClear = report?.available && report.alerts.every((a) => a.count === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold">Operations</h1>
          <p className="text-sm text-muted-foreground">
            Payments that took money, and whether a ticket came out the other end.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/60">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading && !report && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {report?.available && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Owed a refund', value: report.totals.owedRefund, urgent: true },
            { label: 'Payments issued', value: report.totals.issued, urgent: false },
            { label: 'Payment events seen', value: report.totals.paymentEvents, urgent: false },
          ].map((stat) => (
            <Card
              key={stat.label}
              className={stat.urgent && stat.value > 0 ? 'border-destructive/60' : undefined}
            >
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p
                  className={cn(
                    'mt-1 font-headline text-3xl font-bold',
                    stat.urgent && stat.value > 0 ? 'text-destructive' : ''
                  )}
                >
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/*
        Zero and zero are not the same answer. "Nothing needs attention" over a platform
        that has never taken a payment reads as a broken page, because there is nothing
        for the console to have checked. Saying which of the two it is costs one branch.
      */}
      {allClear && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            {report!.totals.paymentEvents === 0 ? (
              <div>
                <p className="font-semibold">No payments yet</p>
                <p className="text-sm text-muted-foreground">
                  The checks ran and found nothing because nothing has been sold. Every figure
                  here is a live query against <code>payment_events</code> and{' '}
                  <code>issued_payments</code> — the moment a first ticket is bought, this page
                  starts answering for it.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">Nothing needs attention</p>
                <p className="text-sm text-muted-foreground">
                  No payment has been taken without a ticket, nothing is stuck, and every ticket
                  email that was attempted went out.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {urgent.length > 0 && (
        <Card className="border-destructive/60 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                {report!.totals.owedRefund} customer
                {report!.totals.owedRefund === 1 ? '' : 's'} paid and have no ticket
              </p>
              <p className="text-sm text-muted-foreground">
                They were emailed automatically to say a refund is coming. The refund itself
                still has to be issued in Stripe or KODA — that part is not automatic.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {report?.alerts.map((alert) => (
          <Card key={alert.key} className={TONE[alert.count > 0 ? alert.health : 'ok']}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{alert.label}</CardTitle>
                <Badge
                  variant={
                    alert.count === 0
                      ? 'secondary'
                      : alert.health === 'urgent'
                        ? 'destructive'
                        : 'gold'
                  }
                >
                  {alert.count}
                </Badge>
              </div>
              <CardDescription>{alert.meaning}</CardDescription>
            </CardHeader>
            {alert.samples.length > 0 && (
              <CardContent>
                <ul className="space-y-2 text-xs">
                  {alert.samples.map((s) => (
                    <li key={s.id} className="rounded border border-border/70 p-2">
                      <p className="break-all font-mono">{s.id}</p>
                      {s.email && <p className="text-muted-foreground">{s.email}</p>}
                      {s.at && (
                        <p className="text-muted-foreground">
                          {new Date(s.at).toLocaleString('en-GB')}
                        </p>
                      )}
                      {s.reason && <p className="text-muted-foreground">{s.reason}</p>}
                      {ACTIONS[alert.key] && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          disabled={working !== null}
                          onClick={() => void act(s.id, ACTIONS[alert.key].action)}
                        >
                          {working === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="h-3.5 w-3.5" />
                          )}
                          {ACTIONS[alert.key].label}
                        </Button>
                      )}
                      {outcome[s.id] && (
                        <p
                          className={cn(
                            'mt-2',
                            outcome[s.id].startsWith('Failed')
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          )}
                        >
                          {outcome[s.id]}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {report && (
        <p className="text-xs text-muted-foreground">
          Read at {new Date(report.generatedAt).toLocaleString('en-GB')}. Figures are live
          queries, not cached counters.
        </p>
      )}
    </div>
  );
}

export default function OperationsPage() {
  return <RequireRole role="superuser">{() => <Operations />}</RequireRole>;
}
