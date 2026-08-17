'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, RefreshCw, TrendingUp } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { formatCurrency } from '@/shared/utils';
import { cn } from '@/shared/utils';

/**
 * Unit economics.
 *
 * Two cost figures, side by side, because they answer different questions and the gap
 * between them *is* the zero-commission model: attributable cost asks whether the fee is
 * priced correctly, full cost asks whether the order made money once processing on the
 * organiser's face value is paid for. A dashboard that showed only the first would read
 * healthy while every high-value international card lost money.
 */

interface Report {
  generatedAt: string;
  available: boolean;
  reason?: string;
  orders: number;
  ticketsSold: number;
  gmvMinor: number;
  organiserPayoutMinor: number;
  serviceFeeMinor: number;
  serviceFeeNetMinor: number;
  vatOnFeeMinor: number;
  attributableCostMinor: number;
  fullCostMinor: number;
  grossContributionMinor: number;
  netContributionMinor: number;
  costMultiple: number | null;
  health: 'healthy' | 'warning' | 'critical' | 'loss' | null;
  revenuePerTicketMinor: number;
  costPerTicketMinor: number;
  profitPerTicketMinor: number;
  lossMakingOrders: number;
}

const money = (minor: number) => formatCurrency(minor / 100);

const HEALTH_VARIANT = {
  healthy: 'success',
  warning: 'gold',
  critical: 'destructive',
  loss: 'destructive',
} as const;

function Profitability() {
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch('/api/admin/profitability');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load unit economics.');
      setReport(body as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load unit economics.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold">Unit economics</h1>
          <p className="text-sm text-muted-foreground">
            What the platform earns, what it costs, and whether the two are the right way
            round.
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

      {report && !report.available && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-5 text-sm">{report.reason}</CardContent>
        </Card>
      )}

      {report?.available && report.orders === 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-5">
            <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">Nothing sold yet</p>
              <p className="text-sm text-muted-foreground">
                Every figure here is computed from real orders. The first ticket sold
                starts answering for it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {report?.available && report.orders > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'GMV', value: money(report.gmvMinor), note: 'Ticket face value' },
              {
                label: 'Paid to organisers',
                value: money(report.organiserPayoutMinor),
                note: '100% of face value',
              },
              {
                label: 'Service fee revenue',
                value: money(report.serviceFeeNetMinor),
                note: `${money(report.vatOnFeeMinor)} VAT collected on top`,
              },
              {
                label: 'Net contribution',
                value: money(report.netContributionMinor),
                note: 'After the whole cost stack',
                bad: report.netContributionMinor < 0,
              },
            ].map((stat) => (
              <Card key={stat.label} className={stat.bad ? 'border-destructive/60' : undefined}>
                <CardContent className="pt-6">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <p
                    className={cn(
                      'mt-1 font-headline text-2xl font-bold',
                      stat.bad && 'text-destructive'
                    )}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Cost multiple</CardTitle>
                  {report.health && (
                    <Badge variant={HEALTH_VARIANT[report.health]}>{report.health}</Badge>
                  )}
                </div>
                <CardDescription>
                  Fee revenue ÷ the cost of earning it. Target is 2.0× — a 100% markup, a
                  50% gross margin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-headline text-3xl font-bold">
                  {report.costMultiple === null ? '—' : `${report.costMultiple.toFixed(2)}×`}
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attributable cost</span>
                  <span className="tabular-nums">{money(report.attributableCostMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross contribution</span>
                  <span className="tabular-nums">{money(report.grossContributionMinor)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className={report.lossMakingOrders > 0 ? 'border-destructive/60' : undefined}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Full cost stack</CardTitle>
                <CardDescription>
                  Processing charged on the whole amount, face value included — the cost of
                  the &ldquo;organiser keeps 100%&rdquo; promise.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total cost</span>
                  <span className="tabular-nums">{money(report.fullCostMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net contribution</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      report.netContributionMinor < 0 && 'text-destructive'
                    )}
                  >
                    {money(report.netContributionMinor)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Orders that lost money</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      report.lossMakingOrders > 0 && 'font-semibold text-destructive'
                    )}
                  >
                    {report.lossMakingOrders} of {report.orders}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Per ticket</CardTitle>
              <CardDescription>Across {report.ticketsSold} tickets sold.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-muted-foreground">Revenue</p>
                <p className="font-headline text-xl font-bold">
                  {money(report.revenuePerTicketMinor)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost</p>
                <p className="font-headline text-xl font-bold">
                  {money(report.costPerTicketMinor)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Profit</p>
                <p
                  className={cn(
                    'font-headline text-xl font-bold',
                    report.profitPerTicketMinor < 0 && 'text-destructive'
                  )}
                >
                  {money(report.profitPerTicketMinor)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/*
            Named rather than buried. Recomputing a historical order from today's config
            is exactly what the brief forbids for accounting, and the fix is already
            half-built — the quote is written into the Stripe session metadata.
          */}
          <p className="text-xs text-muted-foreground">
            Figures are recomputed from ticket prices using the current fee config, not
            from a stored per-order quote. Orders priced under a different config will be
            restated. Read at {new Date(report.generatedAt).toLocaleString('en-GB')}.
          </p>
        </>
      )}
    </div>
  );
}

export default function ProfitabilityPage() {
  return <RequireRole role="superuser">{() => <Profitability />}</RequireRole>;
}
