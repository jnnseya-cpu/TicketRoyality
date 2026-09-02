'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { computeWhiteLabelOrder, toMajor, toMinor } from '@/shared/fees';

/**
 * The organiser's own white-label controls.
 *
 * They set their brand name, their fan booking fee (percentage + flat, absorbed or
 * passed) and — requested only — a custom domain. They do NOT set whether white-label is
 * on, or the platform's per-ticket cut: those are the platform's, shown here read-only,
 * and the save endpoint refuses to write them however the request is shaped.
 *
 * The preview is the same `computeWhiteLabelOrder` the checkout charges through, so what
 * an organiser sees here on a £20 ticket is exactly what a fan will pay and what they will
 * net — no separate marketing arithmetic.
 */
export function WhiteLabelSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [platformPerTicketMinor, setPlatformPerTicketMinor] = React.useState(0);

  const [brandName, setBrandName] = React.useState('');
  const [feePct, setFeePct] = React.useState(0);
  const [feeFixed, setFeeFixed] = React.useState(0); // major units in the field
  const [feeMode, setFeeMode] = React.useState<'absorb' | 'pass'>('absorb');
  const [customDomain, setCustomDomain] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authedFetch('/api/white-label/settings');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!alive) return;
        setEnabled(Boolean(data.enabled));
        setPlatformPerTicketMinor(Number(data.platformPerTicketMinor) || 0);
        setBrandName(String(data.brandName ?? ''));
        setFeePct(Number(data.buyerFeePct) || 0);
        setFeeFixed(toMajor(Number(data.buyerFeeFixedMinor) || 0));
        setFeeMode(data.feeMode === 'pass' ? 'pass' : 'absorb');
        setCustomDomain(String(data.customDomain ?? ''));
      } catch {
        // Leaves the defaults; the card still renders and can be saved.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/white-label/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandName,
          buyerFeePct: feePct,
          buyerFeeFixedMinor: toMinor(feeFixed),
          feeMode,
          customDomain,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Could not save.');
      toast({ title: 'White-label settings saved' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Live preview on one £20 ticket, through the real engine.
  const preview = computeWhiteLabelOrder([{ faceMinor: toMinor(20), qty: 1 }], {
    buyerFeePct: feePct,
    buyerFeeFixedMinor: toMinor(feeFixed),
    feeMode,
    platformPerTicketMinor,
  });
  const gbp = (m: number) => `£${toMajor(Math.round(m)).toFixed(2)}`;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          White-label lets you sell under your own brand and set your own booking fee. It’s
          switched on per account by the TicketRoyality team.
        </p>
        <p>
          You can prepare your brand name and fee below now — they’ll apply the moment
          white-label is enabled for you.
        </p>
        <Editor
          brandName={brandName}
          setBrandName={setBrandName}
          feePct={feePct}
          setFeePct={setFeePct}
          feeFixed={feeFixed}
          setFeeFixed={setFeeFixed}
          feeMode={feeMode}
          setFeeMode={setFeeMode}
          customDomain={customDomain}
          setCustomDomain={setCustomDomain}
        />
        <SaveButton saving={saving} onSave={save} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        White-label is <span className="font-semibold text-primary">on</span> for your
        account. You keep face value; the platform takes a flat{' '}
        <span className="font-semibold text-foreground">{gbp(platformPerTicketMinor)}</span> per
        paid ticket. Your booking fee below is your own revenue.
      </p>

      <Editor
        brandName={brandName}
        setBrandName={setBrandName}
        feePct={feePct}
        setFeePct={setFeePct}
        feeFixed={feeFixed}
        setFeeFixed={setFeeFixed}
        feeMode={feeMode}
        setFeeMode={setFeeMode}
        customDomain={customDomain}
        setCustomDomain={setCustomDomain}
      />

      {/* Live preview — the real checkout arithmetic on a £20 ticket. */}
      <div className="rounded-[--radius] border border-border/70 bg-card/40 p-4 text-sm">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          On a £20 ticket
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Fan pays</p>
            <p className="font-headline text-lg font-bold">{gbp(preview.buyerTotalMinor)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">You net</p>
            <p className="font-headline text-lg font-bold text-primary">
              {gbp(preview.organiserPayoutMinor)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Platform</p>
            <p className="font-headline text-lg font-bold">{gbp(preview.platformFeeMinor)}</p>
          </div>
        </div>
        {!preview.organiserProfitable && (
          <p className="mt-3 text-xs text-destructive">
            At these settings you’d net below zero on this ticket — the platform fee and card
            cost outweigh your booking fee. Raise your fee or pass it on to fans.
          </p>
        )}
      </div>

      <SaveButton saving={saving} onSave={save} />
    </div>
  );
}

function Editor(props: {
  brandName: string;
  setBrandName: (v: string) => void;
  feePct: number;
  setFeePct: (v: number) => void;
  feeFixed: number;
  setFeeFixed: (v: number) => void;
  feeMode: 'absorb' | 'pass';
  setFeeMode: (v: 'absorb' | 'pass') => void;
  customDomain: string;
  setCustomDomain: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="wl-brand">Brand name (shown to fans instead of TicketRoyality)</Label>
        <Input
          id="wl-brand"
          value={props.brandName}
          maxLength={60}
          placeholder="e.g. Lagos Nights"
          onChange={(e) => props.setBrandName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wl-pct">Your booking fee — %</Label>
        <Input
          id="wl-pct"
          type="number"
          min={0}
          max={25}
          step={0.05}
          value={props.feePct}
          onChange={(e) => props.setFeePct(Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="wl-fixed">Your booking fee — flat (£ per ticket)</Label>
        <Input
          id="wl-fixed"
          type="number"
          min={0}
          step={0.05}
          value={props.feeFixed}
          onChange={(e) => props.setFeeFixed(Number(e.target.value))}
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label>How the fee is charged</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => props.setFeeMode('pass')}
            className={`flex-1 rounded-[--radius] border px-3 py-2 text-sm transition-colors ${
              props.feeMode === 'pass'
                ? 'border-primary/60 bg-primary/10'
                : 'border-border/70 text-muted-foreground'
            }`}
          >
            Pass to fan (added on top)
          </button>
          <button
            type="button"
            onClick={() => props.setFeeMode('absorb')}
            className={`flex-1 rounded-[--radius] border px-3 py-2 text-sm transition-colors ${
              props.feeMode === 'absorb'
                ? 'border-primary/60 bg-primary/10'
                : 'border-border/70 text-muted-foreground'
            }`}
          >
            Absorb (comes from your take)
          </button>
        </div>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="wl-domain">Custom domain (optional)</Label>
        <Input
          id="wl-domain"
          value={props.customDomain}
          placeholder="tickets.yourbrand.com"
          onChange={(e) => props.setCustomDomain(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Point this host at TicketRoyality and we’ll serve your events on it. Saving it here
          reserves it; it goes live once DNS and the certificate are attached.
        </p>
      </div>
    </div>
  );
}

function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <Button onClick={onSave} disabled={saving}>
      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
      Save white-label settings
    </Button>
  );
}
