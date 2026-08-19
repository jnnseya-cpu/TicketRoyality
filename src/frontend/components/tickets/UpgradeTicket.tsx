'use client';

import * as React from 'react';
import { ArrowUpCircle, Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventById } from '@/shared/data/repositories';
import { toMajor } from '@/shared/fees';
import { formatCurrency, cn } from '@/shared/utils';
import type { Ticket, TicketTier } from '@/shared/types';

/**
 * Upgrading a general-admission ticket to a dearer type — the seatless sibling of
 * ChangeSeat, and the close of the industries page's last "Not yet": moving an
 * already-issued ticket to a different tier is no longer a refund and a rebooking.
 *
 * Everything binding is server-side: which tiers qualify, what the difference costs
 * (over what was actually paid, plus the service fee on that difference), whether a
 * place is left. This component shows candidates and prices; the API answers with the
 * truth, and the money goes through Stripe before the ticket moves — the webhook is
 * what actually lands the upgrade, exactly like the seated flow. Renders nothing on
 * seated tickets (they upgrade by choosing a seat) and when nothing dearer exists.
 */
export function UpgradeTicket({ ticket }: { ticket: Ticket }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = React.useState<TicketTier[]>([]);
  const [chosen, setChosen] = React.useState('');
  const [quote, setQuote] = React.useState<{ toTierName: string; totalMinor: number } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (ticket.seat || ticket.status !== 'valid') return;
    let cancelled = false;
    getEventById(ticket.eventId)
      .then((event) => {
        if (cancelled || !event) return;
        // Advisory pre-filter only — the server re-decides every one of these.
        setCandidates(
          event.ticketTiers.filter(
            (tier) =>
              tier.id !== ticket.tierId &&
              tier.visibility !== 'hidden' &&
              tier.pricing !== 'choose' &&
              tier.price > ticket.price &&
              tier.quantity - (tier.sold ?? 0) > 0
          )
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ticket.eventId, ticket.tierId, ticket.price, ticket.seat, ticket.status]);

  React.useEffect(() => {
    if (!chosen) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    authedFetch('/api/tickets/seat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tier-quote', ticketId: ticket.id, toTierId: chosen }),
    })
      .then((response) => response.json())
      .then((data: { ok?: boolean; toTierName?: string; totalMinor?: number; error?: string }) => {
        if (cancelled) return;
        if (data.ok && data.toTierName && data.totalMinor != null) {
          setQuote({ toTierName: data.toTierName, totalMinor: data.totalMinor });
        } else {
          setQuote(null);
          if (data.error) toast({ variant: 'destructive', title: 'Not available', description: data.error });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, ticket.id]);

  const upgrade = async () => {
    setBusy(true);
    try {
      const response = await authedFetch('/api/tickets/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tier-upgrade', ticketId: ticket.id, toTierId: chosen }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Upgrade unavailable.');
      window.location.assign(data.url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not start the upgrade',
        description: error instanceof Error ? error.message : 'Try again.',
      });
      setBusy(false);
    }
  };

  if (ticket.seat || ticket.status !== 'valid' || candidates.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Upgrade this ticket
      </p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => setChosen(chosen === tier.id ? '' : tier.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              chosen === tier.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'
            )}
          >
            {tier.name} · {formatCurrency(tier.price, ticket.currency)}
          </button>
        ))}
      </div>
      {chosen && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy || !quote}
          onClick={() => void upgrade()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
          {quote
            ? `Upgrade to ${quote.toTierName} — pay ${formatCurrency(toMajor(quote.totalMinor), ticket.currency)}`
            : 'Checking the price…'}
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        You pay only the difference plus the service fee on it. Your QR code stays the
        same. Moving to a cheaper type is a refund — contact the organiser.
      </p>
    </div>
  );
}
