'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Ticket, XCircle } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useAuth } from '@/frontend/hooks/use-auth';

/**
 * Accepting a whole season pass — every remaining fixture in one press.
 *
 * The same shape as accepting a single ticket, for the same reasons: sign-in is part of
 * the flow because the recipient usually has no account yet, and acceptance is a
 * deliberate button rather than a page-load side effect, or an email client's prefetch
 * would accept a season nobody had read about.
 */
export default function AcceptPassPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user, userProfile, loading } = useAuth();

  const token = search.get('token') ?? '';
  const [state, setState] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [moved, setMoved] = React.useState(0);

  const accept = async () => {
    setState('working');
    try {
      const response = await authedFetch('/api/passes/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          transferId: params.id,
          token,
          name: userProfile?.fullName,
        }),
      });
      const body = (await response.json()) as { error?: string; moved?: number };
      if (!response.ok) throw new Error(body.error ?? 'Could not accept that pass.');
      setMoved(body.moved ?? 0);
      setState('done');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not accept that pass.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container flex min-h-[60vh] max-w-md flex-col justify-center py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> A season pass, sent to you
          </CardTitle>
          <CardDescription>
            Accepting moves every remaining fixture to your account, each with its own
            entry code. The sender keeps the fixtures they already attended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in — or create a free account — and this page will still be here.
              </p>
              <Button variant="royal" className="w-full" asChild>
                <Link
                  href={`/login?next=${encodeURIComponent(`/passes/claim/${params.id}?token=${token}`)}`}
                >
                  Sign in to accept
                </Link>
              </Button>
            </>
          ) : state === 'done' ? (
            <>
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {moved} fixture{moved === 1 ? '' : 's'} moved to your account.
              </p>
              <Button variant="royal" className="w-full" asChild>
                <Link href="/dashboard/customer">See your tickets</Link>
              </Button>
            </>
          ) : state === 'error' ? (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-5 w-5" /> {message}
            </p>
          ) : (
            <Button
              variant="royal"
              className="w-full"
              disabled={state === 'working'}
              onClick={() => void accept()}
            >
              {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Accept the pass
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
