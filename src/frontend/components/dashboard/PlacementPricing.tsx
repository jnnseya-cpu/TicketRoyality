'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useToast } from '@/frontend/hooks/use-toast';
import { PLACEMENTS, type PlacementDef } from '@/shared/placements';

/**
 * The superuser's placement price control — the owner asked for the prices to be
 * changeable from the dashboard rather than fixed in code.
 *
 * Two numbers per placement: the GBP card price and the USD mobile-money price. KODA
 * moves USD and CDF only, so the two rails cannot share one figure. Saved prices land
 * in `config/placements`; the promotions page and both checkouts read the same store,
 * so the number shown and the number charged cannot drift.
 */
export function PlacementPricing() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<PlacementDef[]>(Object.values(PLACEMENTS));
  const [edits, setEdits] = React.useState<Record<string, { gbp: string; usd: string }>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/placements')
      .then((r) => r.json())
      .then((data: { placements?: PlacementDef[] }) => {
        if (!cancelled && data.placements?.length) setRows(data.placements);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const placements: Record<string, { priceMajor?: number; priceUsdMajor?: number }> = {};
    for (const [id, edit] of Object.entries(edits)) {
      const entry: { priceMajor?: number; priceUsdMajor?: number } = {};
      if (edit.gbp.trim()) entry.priceMajor = Number(edit.gbp);
      if (edit.usd.trim()) entry.priceUsdMajor = Number(edit.usd);
      if (Object.keys(entry).length > 0) placements[id] = entry;
    }
    if (Object.keys(placements).length === 0) return;

    setSaving(true);
    try {
      const response = await authedFetch('/api/admin/placement-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placements }),
      });
      const data = (await response.json()) as { error?: string; placements?: PlacementDef[] };
      if (!response.ok) throw new Error(data.error ?? 'The prices were not saved.');
      if (data.placements?.length) setRows(data.placements);
      setEdits({});
      toast({
        title: 'Prices saved',
        description: 'Every future purchase charges the new figures immediately.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Prices not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Placement prices</CardTitle>
        <CardDescription>
          What organisers pay for homepage and newsletter placements — the card rail in
          GBP, the mobile-money rail in USD. Changes take effect on the next purchase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((placement) => {
          const edit = edits[placement.id] ?? { gbp: '', usd: '' };
          return (
            <div
              key={placement.id}
              className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{placement.title}</p>
                <p className="text-xs text-muted-foreground">{placement.periodLabel}</p>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`gbp-${placement.id}`} className="text-xs">
                    Card (GBP)
                  </Label>
                  <Input
                    id={`gbp-${placement.id}`}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="decimal"
                    className="h-9 w-28"
                    placeholder={String(placement.priceMajor)}
                    value={edit.gbp}
                    onChange={(e) =>
                      setEdits((current) => ({
                        ...current,
                        [placement.id]: { ...edit, gbp: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`usd-${placement.id}`} className="text-xs">
                    Mobile money (USD)
                  </Label>
                  <Input
                    id={`usd-${placement.id}`}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="decimal"
                    className="h-9 w-28"
                    placeholder={String(placement.priceUsdMajor)}
                    value={edit.usd}
                    onChange={(e) =>
                      setEdits((current) => ({
                        ...current,
                        [placement.id]: { ...edit, usd: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
        <Button
          variant="royal"
          onClick={save}
          disabled={saving || Object.values(edits).every((e) => !e.gbp.trim() && !e.usd.trim())}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save prices'}
        </Button>
      </CardContent>
    </Card>
  );
}
