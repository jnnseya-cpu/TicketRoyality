'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { useAuth } from '@/frontend/hooks/use-auth';
import type { UserProfile, UserType } from '@/shared/types';

/**
 * Client-side route guard. This is a UX affordance, not a security boundary —
 * actual authorisation is enforced by the Firestore security rules.
 */
export function RequireRole({
  role,
  children,
}: {
  role: UserType;
  children: (profile: UserProfile) => React.ReactNode;
}) {
  const router = useRouter();
  const { user, userProfile, loading, demoMode } = useAuth();

  React.useEffect(() => {
    if (!loading && !user && !demoMode) router.replace('/login');
  }, [loading, user, demoMode, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="container max-w-lg py-16">
        <Alert>
          <LockKeyhole />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>You need an account to view this dashboard.</p>
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/dev-access">Developer access</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (userProfile.userType !== role) {
    return (
      <div className="container max-w-lg py-16">
        <Alert variant="warning">
          <LockKeyhole />
          <AlertTitle>Wrong account type</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This area is for {role} accounts. You are signed in as a {userProfile.userType}.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dev-access">Switch role (development)</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children(userProfile)}</>;
}
