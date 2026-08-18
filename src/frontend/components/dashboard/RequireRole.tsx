'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { dashboardPathFor, useAuth } from '@/frontend/hooks/use-auth';
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
  const { user, userProfile, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  /*
   * Signed in, but no profile document.
   *
   * Registration is two writes to two systems, and anything failing between them leaves
   * exactly this: an account that can sign in, is greeted by name in the header, and is
   * refused by every dashboard because there is no role to read. "Sign in required" is
   * the one message that cannot be true here — they are signed in — and it sends somebody
   * round a loop where logging in again changes nothing and registering again is refused
   * because the email is taken.
   *
   * Naming what happened and pointing at the form that finishes it is the difference
   * between a dead end and a step. Submitting that form with the same email and password
   * completes the half-made account rather than being refused.
   */
  if (user && !userProfile) {
    return (
      <div className="container max-w-lg py-16">
        <Alert variant="warning">
          <LockKeyhole />
          <AlertTitle>Your account needs finishing</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              You are signed in as {user.email}, but your profile was never saved — the sign-up
              was interrupted partway through. Fill the form in once more with the same email
              and password and it will pick up where it stopped.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href="/register/organiser">Finish organiser sign-up</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/register">Finish as a customer</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
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
                <Link href="/register">Create an account</Link>
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
            {/*
              No "switch role" button. Roles are granted server-side — organisers by
              admin approval, admins by `npm run grant:admin`. Offering the change here
              would only ever produce a permission error, because `firestore.rules`
              refuses a self-write to `userType`.
            */}
            <Button size="sm" variant="outline" asChild>
              <Link href={dashboardPathFor(userProfile.userType)}>Go to your dashboard</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children(userProfile)}</>;
}
