'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2, MailX } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';

/**
 * The unsubscribe confirmation.
 *
 * One click, no sign-in. Someone who has decided to stop hearing from you has already
 * decided; making them remember a password to act on it is how an opt-out becomes a
 * spam complaint, and spam complaints cost you the ability to deliver tickets.
 *
 * The actual write happens on an explicit button press rather than on page load,
 * because link scanners and preview bots fetch every URL in an email — an
 * unsubscribe-on-load would opt out people who never clicked.
 */
function Unsubscribe() {
  const params = useSearchParams();
  const uid = params.get('u');
  const token = params.get('t');

  const [state, setState] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState<string | null>(null);

  const confirm = async () => {
    setState('working');
    try {
      const response = await fetch(
        `/api/unsubscribe?u=${encodeURIComponent(uid ?? '')}&t=${encodeURIComponent(token ?? '')}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? 'That link is not valid. It may have been altered in transit — use the link in your most recent email.'
            : 'We could not save that just now. Please try again shortly.'
        );
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setMessage('We could not reach the server. Please try again shortly.');
      setState('error');
    }
  };

  if (!uid || !token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <MailX className="mx-auto h-8 w-8 text-muted-foreground" />
          <CardTitle>Link incomplete</CardTitle>
          <CardDescription>
            Use the unsubscribe link at the bottom of any TicketRoyality email.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'done') {
    return (
      <Card>
        <CardHeader className="text-center">
          <Check className="mx-auto h-8 w-8 text-primary" />
          <CardTitle>Unsubscribed</CardTitle>
          <CardDescription>You will not receive any more marketing emails from us.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {/*
            Said plainly, because this is the fear that makes people hesitate to
            unsubscribe — and an unsubscribe someone is afraid to click is a spam
            complaint instead.
          */}
          <p className="text-sm text-muted-foreground">
            You will still receive your tickets, payment receipts, refund confirmations and
            security notices. Those are part of what you bought, not marketing, and cannot be
            turned off.
          </p>
          <Button asChild variant="outline">
            <Link href="/events">Browse events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <MailX className="mx-auto h-8 w-8 text-muted-foreground" />
        <CardTitle>Stop marketing emails?</CardTitle>
        <CardDescription>
          One click. You will keep receiving tickets, receipts and security notices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        {message && <p className="text-sm text-destructive">{message}</p>}
        <Button
          variant="royal"
          className="w-full"
          onClick={() => void confirm()}
          disabled={state === 'working'}
        >
          {state === 'working' && <Loader2 className="h-4 w-4 animate-spin" />}
          Unsubscribe
        </Button>
        <p className="text-xs text-muted-foreground">
          Changed your mind? Just close this page — nothing has happened yet.
        </p>
      </CardContent>
    </Card>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="container flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      {/* useSearchParams needs a Suspense boundary in an app-router client page. */}
      <React.Suspense
        fallback={
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        }
      >
        <Unsubscribe />
      </React.Suspense>
    </div>
  );
}
