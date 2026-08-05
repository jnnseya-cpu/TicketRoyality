'use client';

import * as React from 'react';
import { Banknote, Building2, CreditCard, Loader2, Wallet } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { useToast } from '@/hooks/use-toast';
import { getTicketsForOrganizer } from '@/server/database';
import { DEFAULT_ADMIN_FEE, DEFAULT_COMMISSION_PERCENT } from '@/shared/constants/billing';
import { formatCurrency } from '@/lib/utils';
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
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  const commissionRate = profile.commissionPercent ?? DEFAULT_COMMISSION_PERCENT;
  const adminFee = profile.adminFee ?? DEFAULT_ADMIN_FEE;

  const gross = tickets.reduce((sum, t) => sum + t.price, 0);
  const commission = (gross * commissionRate) / 100 + adminFee * tickets.length;
  const balance = Math.max(0, gross - commission);

  // Running-balance statement, oldest first.
  const statement = React.useMemo(() => {
    let running = 0;
    return [...tickets]
      .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt))
      .map((ticket) => {
        const fee = (ticket.price * commissionRate) / 100 + adminFee;
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
  }, [tickets, commissionRate, adminFee]);

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
          Your balance after platform commission of {commissionRate}% plus{' '}
          {formatCurrency(adminFee)} per ticket.
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
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gross sales</p>
            <p className="mt-1 font-headline text-2xl font-bold">{formatCurrency(gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Commission withheld
            </p>
            <p className="mt-1 font-headline text-2xl font-bold">{formatCurrency(commission)}</p>
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
              <CardDescription>Every sale, fee and running balance.</CardDescription>
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
                      <TableHead className="text-right">Fee</TableHead>
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
                        <TableCell className="text-right tabular-nums text-destructive">
                          -{formatCurrency(row.debit, row.currency)}
                        </TableCell>
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
