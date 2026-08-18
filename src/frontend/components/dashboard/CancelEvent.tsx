'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useToast } from '@/frontend/hooks/use-toast';
import { formatCurrency } from '@/shared/utils';
import type { Event } from '@/shared/types';

/**
 * The organiser's cancellation control. Irreversible and money-moving, so the title
 * must be typed back — a destructive action behind a single tap is a support queue.
 *
 * What happens on confirm is the service's contract: sales stop, every card order is
 * refunded automatically, free tickets cancel, and mobile-money orders come back as a
 * work list the organiser settles by hand — those transfers went to a phone number,
 * and only a phone can send them back.
 */
export function CancelEvent({ event }: { event: Event }) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<null | {
    refundsStarted: number;
    freeCancelled: number;
    manualRefunds: Array<{ reference: string; amountMinor: number; currency: string }>;
    notified: number;
  }>(null);

  if (event.status === 'cancelled' && !done) {
    return null;
  }

  const cancel = async () => {
    setBusy(true);
    try {
      const response = await authedFetch(`/api/events/${event.id}/cancel`, { method: 'POST' });
      const data = (await response.json()) as { error?: string; summary?: typeof done };
      if (!response.ok || !data.summary) throw new Error(data.error ?? 'Could not cancel.');
      setDone(data.summary);
      toast({
        title: 'Event cancelled',
        description: `${data.summary.refundsStarted} card refund${data.summary.refundsStarted === 1 ? '' : 's'} started, ${data.summary.notified} holder${data.summary.notified === 1 ? '' : 's'} notified.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Not cancelled',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Cancelled — what happens now</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {done.refundsStarted} card order{done.refundsStarted === 1 ? '' : 's'} refunded
            automatically · {done.freeCancelled} free ticket{done.freeCancelled === 1 ? '' : 's'}{' '}
            cancelled · {done.notified} holder{done.notified === 1 ? '' : 's'} emailed.
          </p>
          {done.manualRefunds.length > 0 && (
            <div className="rounded-md border border-destructive/40 p-3">
              <p className="font-medium text-destructive">
                {done.manualRefunds.length} mobile-money payment
                {done.manualRefunds.length === 1 ? '' : 's'} for you to refund by hand:
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {done.manualRefunds.map((refund) => (
                  <li key={refund.reference} className="font-mono">
                    {refund.reference} —{' '}
                    {formatCurrency(refund.amountMinor / 100, refund.currency)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                These transfers arrived on your mobile-money number; send each one back to
                the number it came from. The holders have already been told to expect it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" /> Cancel this event
        </CardTitle>
        <CardDescription>
          Sales stop immediately, every card order is refunded automatically, free tickets
          are cancelled, and every holder is emailed. Mobile-money payments come back to
          you as a list to refund by hand. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[14rem] flex-1"
          placeholder={`Type "${event.title}" to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
        <Button
          variant="destructive"
          disabled={busy || confirmText.trim() !== event.title}
          onClick={() => void cancel()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cancel event and refund
        </Button>
      </CardContent>
    </Card>
  );
}
