'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { dashboardPathFor, useAuth } from '@/frontend/hooks/use-auth';

/**
 * Single entry point for "my account". Sends every signed-in user to the dashboard
 * that matches their role, so nothing in the UI has to branch on user type.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    router.replace(user ? dashboardPathFor(userProfile?.userType) : '/login');
  }, [loading, user, userProfile, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
