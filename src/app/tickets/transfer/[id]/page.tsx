'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Ticket, XCircle } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useAuth } from '@/frontend/hooks/use-auth';

/**
 * Accepting a transferred ticket.
 *
 * The link arrives by email and the recipient usually has no account, so signing in is
 * part of the flow rather than a wall in front of it — the token is preserved across the
 * round trip so they land back here rather than on a dashboard wondering what happened.
 *
 * Acceptance is a deliberate button, never automatic on page load. A link prefetched by
 * an email client would otherwise accept a ticket nobody had read about yet.
 */
export default function AcceptTransferPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();

  const token = search.get('t') ?? '';
  const [state, setState] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  const accept = async () => {
    setState('working');
    try {
      const response = await authedFetch('/api/tickets/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          transferId: params.id,
          token,
          name: userProfile?.fullName,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not accept that ticket.');
      setState('done');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not accept that ticket.');
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
    <div className="container max-w-lg py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> A ticket is waiting for you
          </CardTitle>
          <CardDescription>
            Someone has sent you their ticket. Accepting moves it into your account, and it
            stops working on theirs.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!token && (
            <p className="text-sm text-destructive">
              This link is missing its code. Ask the sender to forward the original email.
            </p>
          )}

          {state === 'done' ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> The ticket is yours.
              </p>
              <Button asChild variant="royal" className="w-full">
                <Link href="/dashboard/customer#tickets">Open my tickets</Link>
              </Button>
            </div>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in or create an account to accept it — a ticket has to live somewhere.
              </p>
              <Button
                variant="royal"
                className="w-full"
                onClick={() => router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
              >
                Sign in to accept
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link
                  href={`/register/customer?next=${encodeURIComponent(`/tickets/transfer/${params.id}?t=${token}`)}`}
                >
                  Create an account
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {state === 'error' && (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
                </p>
              )}
              <Button
                variant="royal"
                className="w-full"
                onClick={() => void accept()}
                disabled={state === 'working' || !token}
              >
                {state === 'working' && <Loader2 className="h-4 w-4 animate-spin" />}
                Accept this ticket
              </Button>
              <p className="text-xs text-muted-foreground">
                Accepting as {user.email}. The sender is told once you have it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
