'use client';

import * as React from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Switch } from '@/frontend/components/ui/switch';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { formatCurrency } from '@/shared/utils';
import type { Event, PriceSuggestion } from '@/shared/types';

/**
 * AI dynamic selling.
 *
 * The AI reads how the event is actually selling and proposes a price per tier. It does
 * **not** change anything: every suggestion is applied by the organiser, one at a time.
 *
 * That is a deliberate choice rather than a missing feature, and the panel says so.
 * There are no checkout inventory holds yet, so a price that moved on its own could move
 * underneath somebody already in a checkout session — they would see one number and be
 * charged another. Until holds exist, a human approves each change.
 */
export function DynamicSellingPanel({ event }: { event: Event }) {
  const [enabled, setEnabled] = React.useState(event.dynamicPricing?.enabled ?? false);
  const [summary, setSummary] = React.useState(event.dynamicPricing?.summary ?? '');
  const [reviewedAt, setReviewedAt] = React.useState(event.dynamicPricing?.lastReviewedAt ?? '');
  const [suggestions, setSuggestions] = React.useState<PriceSuggestion[]>(
    event.dynamicPricing?.suggestions ?? []
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<Record<string, number>>({});

  const post = React.useCallback(
    async (body: Record<string, unknown>) => {
      const response = await authedFetch(`/api/events/${event.id}/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Something went wrong.');
      return json;
    },
    [event.id]
  );

  const toggle = async (next: boolean) => {
    setBusy('toggle');
    setError(null);
    try {
      await post({ action: 'toggle', enabled: next });
      setEnabled(next);
      if (!next) {
        setSuggestions([]);
        setSummary('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that setting.');
    } finally {
      setBusy(null);
    }
  };

  const review = async () => {
    setBusy('review');
    setError(null);
    try {
      const json = await post({ action: 'review' });
      setSuggestions(json.suggestions ?? []);
      setSummary(json.summary ?? '');
      setReviewedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The review could not run.');
    } finally {
      setBusy(null);
    }
  };

  const apply = async (tierId: string) => {
    setBusy(tierId);
    setError(null);
    try {
      const json = await post({ action: 'apply', tierId });
      setApplied((prev) => ({ ...prev, [tierId]: json.price }));
      setSuggestions((prev) => prev.filter((s) => s.tierId !== tierId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that price.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Dynamic selling
            </CardTitle>
            <CardDescription>
              The AI reads how this event is selling and suggests a price per tier. It never
              changes a price on its own — you apply the ones you agree with.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {busy === 'toggle' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={enabled}
              disabled={busy !== null}
              onCheckedChange={(next) => void toggle(next)}
              aria-label="Enable dynamic selling"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            Turn this on to have the AI review your sell-through against the time remaining
            and tell you where a price change is justified. Reviews cost AI credits from
            your wallet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => void review()} disabled={busy !== null}>
                {busy === 'review' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {busy === 'review' ? 'Reviewing…' : 'Review pricing now'}
              </Button>
              {reviewedAt && (
                <span className="text-xs text-muted-foreground">
                  Last reviewed {new Date(reviewedAt).toLocaleString('en-GB')}
                </span>
              )}
            </div>

            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

            {Object.entries(applied).map(([tierId, price]) => (
              <p key={tierId} className="flex items-center gap-2 text-sm text-primary">
                <Check className="h-4 w-4" />
                Price updated to {formatCurrency(price, event.currency)}. It applies to new
                purchases from now — anyone already in checkout keeps the price they were shown.
              </p>
            ))}

            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {reviewedAt
                  ? 'No changes suggested. Holding the current prices is the recommendation — a short sales history is a reason to wait, not to guess.'
                  : 'No review has run yet.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {suggestions.map((s) => {
                  const up = s.suggestedPrice > s.currentPrice;
                  return (
                    <li
                      key={s.tierId}
                      className="rounded-lg border border-border p-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.tierName}</span>
                          <Badge variant={up ? 'gold' : 'secondary'}>
                            {up ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {formatCurrency(s.currentPrice, event.currency)} →{' '}
                            {formatCurrency(s.suggestedPrice, event.currency)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 shrink-0 sm:mt-0"
                        disabled={busy !== null}
                        onClick={() => void apply(s.tierId)}
                      >
                        {busy === s.tierId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Apply
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
