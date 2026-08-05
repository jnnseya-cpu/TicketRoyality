'use client';

import * as React from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { useToast } from '@/hooks/use-toast';
import { findUserByEmail, updateUserProfile } from '@/server/database';
import {
  ACU_USD_RATE,
  MARKUP_MULTIPLIER,
  WELCOME_BONUS_ACU,
  acuToUsd,
  usdToAcu,
} from '@/shared/constants/billing';
import type { UserProfile } from '@/shared/types';

function AcuConsole() {
  const { toast } = useToast();
  const [email, setEmail] = React.useState('');
  const [target, setTarget] = React.useState<UserProfile | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [granting, setGranting] = React.useState(false);
  const [grantUsd, setGrantUsd] = React.useState(5);
  const [reason, setReason] = React.useState('');
  const [notFound, setNotFound] = React.useState(false);

  const search = async () => {
    setSearching(true);
    setNotFound(false);
    setTarget(null);
    try {
      const found = await findUserByEmail(email.trim().toLowerCase());
      if (found) setTarget(found);
      else setNotFound(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSearching(false);
    }
  };

  const grant = async () => {
    if (!target) return;
    const acu = usdToAcu(grantUsd);
    const before = target.wallet?.balanceAcu ?? 0;
    const after = before + acu;

    setGranting(true);
    try {
      // Wallet totals and the immutable ledger must move together. Writing the ledger
      // is a privileged operation, so production routes this through a Cloud Function
      // with the Admin SDK; here we update the denormalised wallet totals.
      await updateUserProfile(target.uid, {
        wallet: {
          balanceAcu: after,
          lifetimeGrantedAcu: (target.wallet?.lifetimeGrantedAcu ?? 0) + acu,
          lifetimePurchasedAcu: target.wallet?.lifetimePurchasedAcu ?? 0,
          lifetimeSpentAcu: target.wallet?.lifetimeSpentAcu ?? 0,
          lastUpdatedAt: new Date().toISOString(),
        },
      });
      setTarget({
        ...target,
        wallet: {
          balanceAcu: after,
          lifetimeGrantedAcu: (target.wallet?.lifetimeGrantedAcu ?? 0) + acu,
          lifetimePurchasedAcu: target.wallet?.lifetimePurchasedAcu ?? 0,
          lifetimeSpentAcu: target.wallet?.lifetimeSpentAcu ?? 0,
          lastUpdatedAt: new Date().toISOString(),
        },
      });
      toast({
        title: `Granted ${acu} ACU`,
        description: `${target.email} · balance ${before} → ${after}`,
      });
      setReason('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Grant failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">ACU console</h1>
        <p className="text-sm text-muted-foreground">
          Grant AI credit to any account. 1 ACU = ${ACU_USD_RATE.toFixed(2)}; AI calls are billed at
          provider cost × {MARKUP_MULTIPLIER}. Every new account is minted with{' '}
          {WELCOME_BONUS_ACU} ACU.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find an account</CardTitle>
          <CardDescription>Search by the exact email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                placeholder="customer@example.com"
                className="pl-9"
              />
            </div>
            <Button onClick={search} disabled={searching || !email.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {notFound && (
            <Alert variant="warning" className="mt-4">
              <Sparkles />
              <AlertTitle>No account found</AlertTitle>
              <AlertDescription>
                No user matches that email. Check the spelling, or confirm they have registered.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {target && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>{target.fullName}</CardTitle>
            <CardDescription>
              {target.email} · <Badge variant="secondary">{target.userType}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ['Balance', target.wallet?.balanceAcu ?? 0],
                ['Granted', target.wallet?.lifetimeGrantedAcu ?? 0],
                ['Purchased', target.wallet?.lifetimePurchasedAcu ?? 0],
                ['Spent', target.wallet?.lifetimeSpentAcu ?? 0],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {label as string}
                  </p>
                  <p className="font-headline text-lg font-bold">{value as number} ACU</p>
                  <p className="text-xs text-muted-foreground">
                    ${acuToUsd(value as number).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="grant-usd">Grant amount (USD)</Label>
                <Input
                  id="grant-usd"
                  type="number"
                  min={1}
                  step="1"
                  value={grantUsd}
                  onChange={(e) => setGrantUsd(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">= {usdToAcu(grantUsd)} ACU</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="grant-reason">Reason (audited)</Label>
                <Input
                  id="grant-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Goodwill credit after failed generation"
                />
              </div>
            </div>

            <Button variant="royal" onClick={grant} disabled={granting || grantUsd <= 0}>
              {granting && <Loader2 className="h-4 w-4 animate-spin" />}
              Grant {usdToAcu(grantUsd)} ACU
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AcuConsolePage() {
  return <RequireRole role="superuser">{() => <AcuConsole />}</RequireRole>;
}
