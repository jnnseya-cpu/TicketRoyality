'use client';

import * as React from 'react';
import { Loader2, Send, Ticket } from 'lucide-react';

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

/**
 * The sender's side of a whole-pass transfer — the sports card's "Not yet".
 *
 * Renders nothing for the overwhelming majority who hold no pass, which is why it is
 * safe on the main dashboard: a card that usually says "you have no passes" is louder
 * than the feature deserves.
 */
export function PassTransfer() {
  const { toast } = useToast();
  const [passes, setPasses] = React.useState<Array<{ passId: string; name: string; fixtures: number }>>([]);
  const [emails, setEmails] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void authedFetch('/api/passes/transfer')
      .then((r) => r.json())
      .then((data: { passes?: Array<{ passId: string; name: string; fixtures: number }> }) => {
        if (!cancelled) setPasses(data.passes ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (passes.length === 0) return null;

  const send = async (passId: string) => {
    setBusy(passId);
    try {
      const response = await authedFetch('/api/passes/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', passId, toEmail: emails[passId] ?? '' }),
      });
      const data = (await response.json()) as { error?: string; ticketCount?: number };
      if (!response.ok) throw new Error(data.error ?? 'Could not start the transfer.');
      toast({
        title: 'Pass sent',
        description: `They have a link to accept ${data.ticketCount} remaining fixture${data.ticketCount === 1 ? '' : 's'}. Every fixture stays yours until they do.`,
      });
      setEmails((current) => ({ ...current, [passId]: '' }));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Transfer not started',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4 text-primary" /> Season passes
        </CardTitle>
        <CardDescription>
          Send a whole pass — every remaining fixture moves in one go. Fixtures you already
          attended stay in your history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {passes.map((pass) => (
          <div key={pass.passId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {pass.name}
              <span className="ml-2 text-muted-foreground">{pass.fixtures} fixtures</span>
            </span>
            <Input
              type="email"
              placeholder="their@email.com"
              className="h-9 w-52"
              value={emails[pass.passId] ?? ''}
              onChange={(event) =>
                setEmails((current) => ({ ...current, [pass.passId]: event.target.value }))
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy === pass.passId || !(emails[pass.passId] ?? '').includes('@')}
              onClick={() => void send(pass.passId)}
            >
              {busy === pass.passId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send pass
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
