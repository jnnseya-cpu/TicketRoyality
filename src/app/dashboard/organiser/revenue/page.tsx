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
  // White-label organisers keep their recorded payout, not face — the client cannot compute
  // that, so the server returns it. Null / whiteLabel:false = a standard organiser, and the
  // page keeps its face-value calculation untouched.
  const [wl, setWl] = React.useState<{
    whiteLabel: boolean;
    payableMinor?: number;
    grossMinor?: number;
    orders?: Array<{ id: string; date: string; description: string; payoutMinor: number; currency: string }>;
  } | null>(null);
  // Stripe Connect payout-account status. `enabled` false = Connect is off platform-wide.
  const [connect, setConnect] = React.useState<{
    enabled: boolean;
    connected: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const [connecting, setConnecting] = React.useState(false);
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
    authedFetch('/api/white-label/owed')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setWl(data);
      })
      .catch(() => undefined);
    authedFetch('/api/connect/onboard')
      .then((res) => res.json())
      .then((data: { enabled?: boolean; connected?: boolean; payoutsEnabled?: boolean }) => {
        if (!cancelled)
          setConnect({
            enabled: Boolean(data.enabled),
            connected: Boolean(data.connected),
            payoutsEnabled: Boolean(data.payoutsEnabled),
          });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  // Fire the real per-event payouts to the connected account. Each event settles once,
  // keyed server-side, so a double click never pays twice.
  const [paying, setPaying] = React.useState(false);
  const requestPayout = async () => {
    if (!connect?.payoutsEnabled) {
      toast({
        title: 'Connect a payout account first',
        description: 'Set up automatic payouts to receive your settlement.',
      });
      return;
    }
    setPaying(true);
    try {
      const res = await authedFetch('/api/connect/payout', { method: 'POST' });
      const data = (await res.json()) as { paid?: number; blocked?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Payout could not be started.');
      toast({
        title: data.paid ? 'Payout on its way' : 'Nothing new to pay out',
        description: data.paid
          ? `${data.paid} event${data.paid === 1 ? '' : 's'} settled to your bank.`
          : 'Your finished events are already settled.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Payout failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setPaying(false);
    }
  };

  // Start (or resume) Stripe Connect onboarding, then follow Stripe's hosted link.
  const startConnect = async () => {
    setConnecting(true);
    try {
      const res = await authedFetch('/api/connect/onboard', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not start onboarding.');
      window.location.href = data.url;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not connect payouts',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setConnecting(false);
    }
  };

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
  const settled = settle(onlineTickets, terms);

  // The door-sale fees owed, as a single settlement-currency figure (the page pays out in
  // GBP; it already pools ticket amounts across currencies the same way).
  const feesOwed = React.useMemo(
    () => Object.values(owed).reduce((sum, minor) => sum + minor, 0) / 100,
    [owed]
  );

  // White-label organisers keep their recorded PAYOUT, not face — so on white-label the
  // balance, the credited figure and the statement all come from the server (Slice E's
  // arithmetic), never the client-side face guess. `net` on a white-label account would
  // overstate what they will actually receive by the platform's per-ticket cut.
  const isWhiteLabel = Boolean(wl?.whiteLabel);
  const gross = isWhiteLabel ? (wl?.grossMinor ?? 0) / 100 : settled.gross;
  const commission = settled.platformTotal;
  const net = isWhiteLabel ? (wl?.payableMinor ?? 0) / 100 : settled.net;
  const balance = Math.max(0, net - feesOwed);

  // The standard model charges the organiser nothing and pays 100% of face — platform
  // revenue is the buyer-side service fee already in the ticket price. Only a bespoke,
  // superuser-set per-organiser agreement makes commission non-zero, and only then does the
  // commission framing below apply.
  const hasCommission = terms.percent > 0 || terms.adminFee > 0;

  // Running-balance statement, oldest first. Box-office sales are excluded — they never
  // pay out — so the statement reconciles to the available balance above.
  const statement = React.useMemo(() => {
    // White-label: one line per paid order, crediting the recorded payout (not face). The
    // running balance reconciles to the available balance above the same way the standard
    // statement does.
    if (isWhiteLabel) {
      const lines = [...(wl?.orders ?? [])].sort((a, b) => a.date.localeCompare(b.date));
      let running = 0;
      return lines
        .map((order) => {
          const credit = order.payoutMinor / 100;
          running += credit;
          return {
            id: order.id,
            date: order.date,
            description: order.description,
            debit: 0,
            credit,
            balance: running,
            currency: order.currency,
          };
        })
        .reverse();
    }
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
  }, [isWhiteLabel, wl, onlineTickets, terms]);

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
          {isWhiteLabel ? (
            <>
              Your white-label payout — what you keep after your own booking fee, the
              platform&apos;s flat per-ticket fee and the card cost you bear. Not face value,
              and computed from what each order actually recorded.{' '}
            </>
          ) : hasCommission ? (
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
              {isWhiteLabel ? 'Fans paid (all-in)' : 'Online sales (paid to you)'}
            </p>
            <p className="mt-1 font-headline text-2xl font-bold">{formatCurrency(gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            {isWhiteLabel ? (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Fees &amp; card costs
                </p>
                <p className="mt-1 font-headline text-2xl font-bold tabular-nums text-destructive">
                  -{formatCurrency(Math.max(0, gross - net))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Platform per-ticket fee and card processing, deducted before your payout.
                </p>
              </>
            ) : hasCommission ? (
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
                <Button variant="royal" onClick={requestPayout} disabled={paying}>
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Withdraw ${formatCurrency(balance)}`
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {connect?.enabled && (
            <Card className={connect.payoutsEnabled ? 'border-primary/30 bg-primary/5' : undefined}>
              <CardHeader>
                <CardTitle>Automatic payouts</CardTitle>
                <CardDescription>
                  {connect.payoutsEnabled
                    ? 'Your payout account is connected. Settlements are sent to your bank automatically.'
                    : connect.connected
                      ? 'Nearly there — finish the payout setup with Stripe to receive settlements.'
                      : 'Connect a payout account to receive your settlements straight to your bank.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {connect.payoutsEnabled ? (
                  <Badge variant="secondary">Payouts connected</Badge>
                ) : (
                  <Button variant="royal" onClick={startConnect} disabled={connecting}>
                    {connecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : connect.connected ? (
                      'Finish payout setup'
                    ) : (
                      'Connect a payout account'
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

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
                {isWhiteLabel
                  ? 'Every paid order and running balance — credited at your white-label payout.'
                  : hasCommission
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
