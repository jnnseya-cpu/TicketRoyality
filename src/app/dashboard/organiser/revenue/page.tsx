'use client';

import * as React from 'react';
import { Banknote, Building2, CreditCard, Loader2, Wallet } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getTicketsForOrganizer } from '@/shared/data/repositories';
import { commissionTermsFor, platformCutForTicket, settle } from '@/shared/pricing';
import { formatCurrency } from '@/shared/utils';
import type { Ticket, UserProfile } from '@/shared/types';

const MINIMUM_WITHDRAWAL = 10;

const PAYOUT_METHODS = [
  { id: 'stripe', name: 'Stripe Connect', icon: CreditCard, blurb: 'Automatic daily payouts.' },
  { id: 'bitripay', name: 'Bitripay', icon: Wallet, blurb: 'Wallet settlement in USD.' },
  { id: 'bank', name: 'Bank transfer', icon: Building2, blurb: 'Manual SEPA / Faster Payments.' },
];

function Revenue({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  // Box-office service fee the organiser owes, per currency in minor units (net of refunds).
  const [owed, setOwed] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getTicketsForOrganizer(profile.uid)
      .then((result) => {
        if (!cancelled) setTickets(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Door sales are cash/card/mobile money in the organiser's own hand, so their fee is
    // owed to the platform and netted off the payout rather than paid out.
    authedFetch('/api/box-office/sales')
      .then((res) => res.json())
      .then((data: { owed?: Record<string, number> }) => {
        if (!cancelled) setOwed(data.owed ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  // Memoised so the statement below is not rebuilt on every render by a fresh object identity.
  const terms = React.useMemo(() => commissionTermsFor(profile), [profile]);

  // Only tickets whose money the platform actually collected are payable. A box-office
  // (`offline`) sale's face value is already in the organiser's hand — counting it as
  // payable would pay them a second time for cash they already took. `offline` is the
  // box-office issuance path (see box-office.ts); nothing else issues under it today.
  const onlineTickets = React.useMemo(
    () => tickets.filter((t) => t.paymentProvider !== 'offline'),
    [tickets]
  );
  const { gross, platformTotal: commission, net } = settle(onlineTickets, terms);

  // The door-sale fees owed, as a single settlement-currency figure (the page pays out in
  // GBP; it already pools ticket amounts across currencies the same way).
  const feesOwed = React.useMemo(
    () => Object.values(owed).reduce((sum, minor) => sum + minor, 0) / 100,
    [owed]
  );
  const balance = Math.max(0, net - feesOwed);

  // The standard model charges the organiser nothing and pays 100% of face — platform
  // revenue is the buyer-side service fee already in the ticket price. Only a bespoke,
  // superuser-set per-organiser agreement makes commission non-zero, and only then does the
  // commission framing below apply.
  const hasCommission = terms.percent > 0 || terms.adminFee > 0;

  // Running-balance statement, oldest first. Box-office sales are excluded — they never
  // pay out — so the statement reconciles to the available balance above.
  const statement = React.useMemo(() => {
    let running = 0;
    return [...onlineTickets]
      .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt))
      .map((ticket) => {
        const fee = platformCutForTicket(ticket.price, terms);
        const credit = ticket.price - fee;
        running += credit;
        return {
          id: ticket.id,
          date: ticket.purchasedAt,
          description: `${ticket.eventTitle} — ${ticket.tierName}`,
          debit: fee,
          credit,
          balance: running,
          currency: ticket.currency,
        };
      })
      .reverse();
  }, [onlineTickets, terms]);

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
        <h1 className="font-headline text-2xl font-bold">Revenue &amp; payouts</h1>
        <p className="text-sm text-muted-foreground">
          {hasCommission ? (
            <>
              Your balance after your agreed platform commission of {terms.percent}% plus{' '}
              {formatCurrency(terms.adminFee)} per ticket.{' '}
            </>
          ) : (
            <>
              You keep 100% of face value — the platform&apos;s service fee is charged to the
              buyer at checkout, not taken from your payout.{' '}
            </>
          )}
          Box-office (door) sales are collected by you in person, so their face value is not
          paid out here — only the service fee you owe on them is deducted.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-6">
            <Banknote className="h-7 w-7 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Available balance
              </p>
              <p className="font-headline text-2xl font-bold">{formatCurrency(balance)}</p>
              {hasCommission && feesOwed > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Box-office service fees owed:{' '}
                  <span className="tabular-nums text-destructive">
                    -{formatCurrency(feesOwed)}
                  </span>{' '}
                  netted off
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Online sales (paid to you)
            </p>
            <p className="mt-1 font-headline text-2xl font-bold">{formatCurrency(gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            {hasCommission ? (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Commission withheld
                </p>
                <p className="mt-1 font-headline text-2xl font-bold">
                  {formatCurrency(commission)}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Box-office fees owed
                </p>
                <p className="mt-1 font-headline text-2xl font-bold tabular-nums text-destructive">
                  {feesOwed > 0 ? `-${formatCurrency(feesOwed)}` : formatCurrency(0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Service fee on door sales, deducted from your balance.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="withdraw">
        <TabsList>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="withdraw" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Request a withdrawal</CardTitle>
              <CardDescription>
                Minimum withdrawal {formatCurrency(MINIMUM_WITHDRAWAL)}. Funds clear in 2–3 working
                days.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {balance < MINIMUM_WITHDRAWAL ? (
                <Alert>
                  <Banknote />
                  <AlertTitle>Below the minimum</AlertTitle>
                  <AlertDescription>
                    You need at least {formatCurrency(MINIMUM_WITHDRAWAL)} to request a payout.
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  variant="royal"
                  onClick={() =>
                    toast({
                      title: 'Withdrawal requested',
                      description: `${formatCurrency(balance)} queued for payout.`,
                    })
                  }
                >
                  Withdraw {formatCurrency(balance)}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payout methods</CardTitle>
              <CardDescription>Where your settlements are sent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PAYOUT_METHODS.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between rounded-md border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <method.icon className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{method.name}</p>
                      <p className="text-xs text-muted-foreground">{method.blurb}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Set up
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statement">
          <Card>
            <CardHeader>
              <CardTitle>Account statement</CardTitle>
              <CardDescription>
                {hasCommission
                  ? 'Every sale, fee and running balance.'
                  : 'Every online sale and running balance — you keep the full face value.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {statement.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No transactions yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      {hasCommission && <TableHead className="text-right">Fee</TableHead>}
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.date).toDateString()}
                        </TableCell>
                        <TableCell className="max-w-[18rem] truncate">{row.description}</TableCell>
                        {hasCommission && (
                          <TableCell className="text-right tabular-nums text-destructive">
                            -{formatCurrency(row.debit, row.currency)}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-success">
                          +{formatCurrency(row.credit, row.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(row.balance, row.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Badge variant="secondary">Settlement currency: GBP</Badge>
    </div>
  );
}

export default function RevenuePage() {
  return <RequireRole role="organiser">{(profile) => <Revenue profile={profile} />}</RequireRole>;
}
