'use client';

import * as React from 'react';
import { Check, Loader2, Send } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import type { Ticket } from '@/shared/types';

/**
 * Sending a ticket to someone else.
 *
 * Deliberately understated: a transfer is irreversible once accepted, so it does not get
 * a prominent button competing with "show my QR" at a door. The copy says what actually
 * happens — the ticket stops working on this phone — because that is the part people are
 * surprised by afterwards.
 */
export function TransferTicket({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const send = async () => {
    setState('sending');
    setError(null);
    try {
      const response = await authedFetch('/api/tickets/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', ticketId: ticket.id, toEmail: email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not send that ticket.');
      setState('sent');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : 'Could not send that ticket.');
    }
  };

  if (state === 'sent') {
    return (
      <p className="flex items-center justify-center gap-2 text-xs text-primary">
        <Check className="h-3.5 w-3.5" />
        Sent to {email}. It stays yours until they accept.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
      >
        Send this ticket to someone else
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">
        They get an email with a link. Once they accept, the ticket is theirs and stops
        scanning on this phone.
      </p>
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their@email.com"
          autoComplete="off"
        />
        <Button
          size="sm"
          onClick={() => void send()}
          disabled={state === 'sending' || !email.includes('@')}
        >
          {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
