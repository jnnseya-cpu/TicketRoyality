'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles, Wallet } from 'lucide-react';

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
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { getLedgerEntries } from '@/shared/data/repositories';
import {
  ACU_USD_RATE,
  TOPUP_PACKAGES_USD,
  acuToUsd,
  usdToAcu,
} from '@/shared/constants/billing';
import type { LedgerEntry, UserProfile } from '@/shared/types';

function WalletView({ profile }: { profile: UserProfile }) {
  const [entries, setEntries] = React.useState<LedgerEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getLedgerEntries(profile.uid)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  const wallet = profile.wallet;
  const balance = wallet?.balanceAcu ?? 0;

  return (
    <div className="container max-w-4xl py-10">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href="/dashboard/customer">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <h1 className="font-headline text-3xl font-bold">AI credit wallet</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        AI features are billed in ACU. 1 ACU = ${ACU_USD_RATE.toFixed(2)}. Every AI action shows
        its price before it runs, rounded up to the next whole ACU. When your balance runs out, AI
        features stop until you top up — nothing is ever charged silently.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Card className="sm:col-span-2 border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-6">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
              <p className="font-headline text-3xl font-bold">{balance} ACU</p>
              <p className="text-xs text-muted-foreground">≈ ${acuToUsd(balance).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>

        {[
          ['Granted', wallet?.lifetimeGrantedAcu ?? 0],
          ['Purchased', wallet?.lifetimePurchasedAcu ?? 0],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Lifetime {label as string}
              </p>
              <p className="font-headline text-2xl font-bold">{value as number} ACU</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Top up</CardTitle>
          <CardDescription>
            Fixed packages, paid by card. Credits are added the moment the payment clears.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {TOPUP_PACKAGES_USD.map((amount) => (
            <form key={amount} action="/api/checkout" method="POST">
              <input type="hidden" name="name" value={`TicketRoyality — ${usdToAcu(amount)} ACU`} />
              <input type="hidden" name="amount" value={amount} />
              <input type="hidden" name="quantity" value={1} />
              <input type="hidden" name="currency" value="USD" />
              <input type="hidden" name="userId" value={profile.uid} />
              <Button type="submit" variant="outline" className="h-auto w-full flex-col py-4">
                <span className="font-headline text-xl font-bold text-primary">${amount}</span>
                <span className="text-xs text-muted-foreground">{usdToAcu(amount)} ACU</span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Transaction ledger</CardTitle>
          <CardDescription>
            Every credit and debit, immutable and fully auditable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No wallet activity yet beyond your welcome credit.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.deltaAcu >= 0 ? 'success' : 'secondary'}>
                        {entry.type.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        entry.deltaAcu >= 0 ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {entry.deltaAcu >= 0 ? '+' : ''}
                      {entry.deltaAcu}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.balanceAfterAcu}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WalletPage() {
  return <RequireRole role="customer">{(profile) => <WalletView profile={profile} />}</RequireRole>;
}
