'use client';

import * as React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Banknote, CreditCard, Loader2, Smartphone, Ticket } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { QR_VERSION, encodeTicketQr } from '@/shared/tickets/qr';
import { formatCurrency } from '@/shared/utils';
import type { BoxOfficeTender, TicketTier } from '@/shared/types';

/** The minimal ticket shape the sale-tickets endpoint returns, enough to draw the QR. */
interface IssuedTicket {
  id: string;
  reference: string;
  eventId: string;
  qrSignature?: string;
  seat?: string;
}

const TENDERS: Array<{ id: BoxOfficeTender; label: string; icon: typeof Banknote }> = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'card', label: 'Card in person', icon: CreditCard },
  { id: 'mobile_money', label: 'Mobile money', icon: Smartphone },
];

/**
 * Sell a ticket at the door. Shared by the organiser dashboard and the scoped staff link;
 * the only difference is authorisation — a `pin` posts through the staff link, its absence
 * uses the logged-in organiser's token. Price is shown from the same `computeOrderFees` the
 * server charges, so what staff read is what the buyer pays and the server re-prices it
 * anyway.
 */
export function BoxOfficeSell({
  eventId,
  currency,
  tiers,
  pin,
}: {
  eventId: string;
  currency: string;
  tiers: TicketTier[];
  pin?: string;
}) {
  const { toast } = useToast();
  const sellable = tiers.filter((t) => t.price > 0);
  const [tierId, setTierId] = React.useState(sellable[0]?.id ?? '');
  const [qty, setQty] = React.useState(1);
  const [tender, setTender] = React.useState<BoxOfficeTender>('cash');
  const [buyerName, setBuyerName] = React.useState('');
  const [buyerEmail, setBuyerEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState<{ total: number; fee: number; qty: number } | null>(null);
  const [issued, setIssued] = React.useState<IssuedTicket[]>([]);
  const [showQr, setShowQr] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);

  // Issuance runs a beat behind the sale, so poll the sale's tickets for a few seconds and
  // show the QR the moment they exist — a buyer with no email still leaves with their
  // ticket. Giving up is harmless: the ticket is issued regardless (emailed, or scanned in).
  const pollForTickets = React.useCallback(
    async (saleId: string) => {
      setWaiting(true);
      const url = `/api/box-office/sale-tickets?saleId=${encodeURIComponent(saleId)}${
        pin ? `&pin=${encodeURIComponent(pin)}` : ''
      }`;
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const r = pin ? await fetch(url) : await authedFetch(url);
          const d = (await r.json()) as { tickets?: IssuedTicket[] };
          if (r.ok && d.tickets && d.tickets.length > 0) {
            setIssued(d.tickets);
            setShowQr(true);
            setWaiting(false);
            return;
          }
        } catch {
          /* keep polling */
        }
      }
      setWaiting(false);
    },
    [pin]
  );

  const tier = tiers.find((t) => t.id === tierId);
  const quote = tier ? computeOrderFees([{ faceMinor: toMinor(tier.price), qty }]) : null;

  const sell = async () => {
    if (!tier) return;
    setBusy(true);
    setLast(null);
    try {
      const payload = {
        eventId,
        tierId,
        quantity: qty,
        tender,
        buyerName: buyerName.trim() || undefined,
        buyerEmail: buyerEmail.trim() || undefined,
        ...(pin ? { pin } : {}),
      };
      const res = pin
        ? await fetch('/api/box-office/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await authedFetch('/api/box-office/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = (await res.json()) as {
        error?: string;
        saleId?: string;
        buyerTotalMinor?: number;
        serviceFeeMinor?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'The sale did not go through.');
      setLast({
        total: toMajor(data.buyerTotalMinor ?? 0),
        fee: toMajor(data.serviceFeeMinor ?? 0),
        qty,
      });
      if (data.saleId) void pollForTickets(data.saleId);
      toast({ title: 'Ticket issued', description: `${qty} × ${tier.name}` });
      // Ready for the next customer; keep the tier and tender chosen.
      setQty(1);
      setBuyerName('');
      setBuyerEmail('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Not sold',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (sellable.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        This event has no paid ticket types to sell at the door.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Ticket type</Label>
        <Select value={tierId} onValueChange={setTierId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a ticket" />
          </SelectTrigger>
          <SelectContent>
            {sellable.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} — {formatCurrency(t.price, currency)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Quantity</Label>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            −
          </Button>
          <span className="w-10 text-center text-lg font-semibold tabular-nums">{qty}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => setQty((q) => Math.min(50, q + 1))} disabled={qty >= 50}>
            +
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>How was it paid?</Label>
        <div className="grid grid-cols-3 gap-2">
          {TENDERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTender(id)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                tender === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Buyer name (optional)</Label>
          <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="For the receipt" />
        </div>
        <div className="space-y-1.5">
          <Label>Email (optional)</Label>
          <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="Emails their ticket" />
        </div>
      </div>

      {quote && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span>Buyer pays</span>
            <span className="font-semibold">{formatCurrency(toMajor(quote.buyerTotalMinor), currency)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Includes service fee you’ll owe</span>
            <span>{formatCurrency(toMajor(quote.serviceFeeMinor), currency)}</span>
          </div>
        </div>
      )}

      <Button variant="royal" className="w-full" onClick={sell} disabled={busy || !tier}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Ticket className="h-4 w-4" /> Issue ticket{qty > 1 ? 's' : ''} — {quote ? formatCurrency(toMajor(quote.buyerTotalMinor), currency) : ''}
          </>
        )}
      </Button>

      {last && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-center text-sm">
          <p>
            Issued {last.qty} ticket{last.qty > 1 ? 's' : ''} · collected{' '}
            <strong>{formatCurrency(last.total, currency)}</strong>
            {buyerEmail ? ' and emailed to the buyer' : ''}. You owe{' '}
            {formatCurrency(last.fee, currency)} service fee, billed at payout.
          </p>
          {waiting && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Preparing the ticket QR…
            </p>
          )}
          {!waiting && issued.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowQr(true)}>
              Show ticket QR
            </Button>
          )}
        </div>
      )}

      {/* The QR to scan or hand to the buyer immediately — the door accepts the static
          signature, so a fresh sale can be admitted or screenshotted on the spot. */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ticket{issued.length > 1 ? 's' : ''} ready</DialogTitle>
            <DialogDescription>
              Scan to admit the buyer now, or let them photograph it.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {issued.map((t) => (
              <div key={t.id} className="text-center">
                <div className="mx-auto flex w-fit justify-center rounded-lg bg-white p-4">
                  <QRCodeCanvas
                    value={encodeTicketQr({
                      v: QR_VERSION,
                      t: t.id,
                      e: t.eventId,
                      r: t.reference,
                      s: t.qrSignature,
                    })}
                    size={180}
                    level="M"
                  />
                </div>
                <p className="mt-1 font-mono text-xs">{t.reference}</p>
                {t.seat && <p className="text-xs text-muted-foreground">Seat {t.seat}</p>}
              </div>
            ))}
          </div>
          <Button onClick={() => setShowQr(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
