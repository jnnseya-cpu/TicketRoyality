'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, KeyRound, ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { updateUserProfile } from '@/server/database';
import type { UserType } from '@/shared/types';

const ROLES: Array<{ id: UserType; label: string; email: string; blurb: string }> = [
  {
    id: 'superuser',
    label: 'Platform admin',
    email: 'admin@ticketroyality.com',
    blurb: 'Approvals, commissions, offline payments, ACU grants, platform-wide analytics.',
  },
  {
    id: 'organiser',
    label: 'Event organiser',
    email: 'organiser@ticketroyality.com',
    blurb: 'Create events, sell tickets, run door check-in, view revenue and reports.',
  },
  {
    id: 'customer',
    label: 'Customer',
    email: 'customer@ticketroyality.com',
    blurb: 'Buy tickets, view QR codes, manage wallet and account details.',
  },
];

/**
 * Development access portal.
 *
 * Two modes:
 *  - No Firebase configured: switches the in-memory demo identity so every dashboard
 *    is explorable without a backend.
 *  - Firebase configured: elevates the *currently signed-in* account's role, so you
 *    can promote a freshly registered test account to organiser or admin.
 *
 * This page must be removed or gated behind an allowlist before production launch.
 */
export default function DevAccessPage() {
  const { user, userProfile, demoMode, setDemoRole, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [working, setWorking] = React.useState<UserType | null>(null);

  const activate = async (role: UserType) => {
    setWorking(role);
    try {
      if (demoMode) {
        setDemoRole(role);
        toast({ title: 'Demo identity switched', description: `You are now a ${role}.` });
      } else if (user) {
        await updateUserProfile(user.uid, { userType: role, status: 'approved' });
        await refreshProfile();
        toast({
          title: 'Role updated',
          description: `${user.email} is now an approved ${role}.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Sign in first',
          description: 'Register or log in, then come back to set the account role.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update role',
        description: error instanceof Error ? error.message : 'Check your Firestore rules.',
      });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-6">
        <Badge variant="destructive" className="mb-3">
          Development only
        </Badge>
        <h1 className="font-headline text-3xl font-bold">Developer access portal</h1>
        <p className="mt-2 text-muted-foreground">
          Switch between the three account types to test every dashboard end to end.
        </p>
      </div>

      <Alert variant="warning" className="mb-6">
        <ShieldAlert />
        <AlertTitle>Remove before launch</AlertTitle>
        <AlertDescription>
          This page changes account roles without approval. Delete{' '}
          <code>src/app/dev-access</code> or put it behind an allowlist before going live.
        </AlertDescription>
      </Alert>

      {demoMode ? (
        <Alert className="mb-6">
          <KeyRound />
          <AlertTitle>Running without Firebase</AlertTitle>
          <AlertDescription>
            No <code>NEXT_PUBLIC_FIREBASE_*</code> variables are set, so the platform is serving the
            built-in demo dataset. Pick a role below to explore that dashboard immediately — no
            password required.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-6">
          <KeyRound />
          <AlertTitle>Connected to Firebase</AlertTitle>
          <AlertDescription>
            Register each test email once at{' '}
            <Link href="/register" className="text-primary hover:underline">
              /register
            </Link>
            , sign in, then use the buttons below to set that account&apos;s role.
            {user ? (
              <>
                {' '}
                Signed in as <strong>{user.email}</strong>
                {userProfile ? ` (${userProfile.userType})` : ''}.
              </>
            ) : (
              ' You are not signed in.'
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {ROLES.map((role) => {
          const active = userProfile?.userType === role.id;
          return (
            <Card key={role.id} className={active ? 'border-primary/50' : undefined}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{role.label}</CardTitle>
                  {active && (
                    <Badge variant="gold" className="gap-1">
                      <Check className="h-3 w-3" /> Active
                    </Badge>
                  )}
                </div>
                <CardDescription>{role.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <code className="rounded bg-secondary px-2 py-1 text-xs">{role.email}</code>
                <code className="rounded bg-secondary px-2 py-1 text-xs">Royal!Test2026</code>
                <Button
                  className="ml-auto"
                  variant={active ? 'outline' : 'default'}
                  disabled={working !== null}
                  onClick={() => void activate(role.id)}
                >
                  {working === role.id ? 'Applying…' : demoMode ? 'Use this identity' : 'Set my role'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator className="my-8" />

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href="/dashboard/customer">Customer dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/organiser">Organiser dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/superuser">Admin dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
