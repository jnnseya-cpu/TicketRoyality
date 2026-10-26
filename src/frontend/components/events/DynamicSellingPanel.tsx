'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Undo2,
  Zap,
} from 'lucide-react';

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
import type { AutoPriceChange, Event, PriceSuggestion } from '@/shared/types';

/**
 * Dynamic selling — two modes, both organiser-controlled.
 *
 * AI review: the model reads how the event is selling and proposes a price per tier; the
 * organiser applies the ones they agree with, one at a time.
 *
 * Automatic (opt-in): deterministic rules raise a scarce or rushing tier and lower a
 * slow one near the date, within baseline-anchored caps (+15% to +50%, −10% to −30%).
 * It applies the change, emails the organiser, and can be undone within 24 hours. Safe
 * because checkout holds now exist and the rules never reprice a tier with seats held in
 * a live checkout — so a price cannot move under someone mid-purchase.
 */
export function DynamicSellingPanel({ event }: { event: Event }) {
  const [enabled, setEnabled] = React.useState(event.dynamicPricing?.enabled ?? false);
  const [summary, setSummary] = React.useState(event.dynamicPricing?.summary ?? '');
  const [reviewedAt, setReviewedAt] = React.useState(event.dynamicPricing?.lastReviewedAt ?? '');
  const [suggestions, setSuggestions] = React.useState<PriceSuggestion[]>(
    event.dynamicPricing?.suggestions ?? []
  );
  const [auto, setAuto] = React.useState(event.dynamicPricing?.auto ?? false);
  const [autoLog, setAutoLog] = React.useState<AutoPriceChange[]>(
    event.dynamicPricing?.autoLog ?? []
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

  const toggleAuto = async (next: boolean) => {
    setBusy('auto');
    setError(null);
    try {
      await post({ action: 'auto', enabled: next });
      setAuto(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change automatic pricing.');
    } finally {
      setBusy(null);
    }
  };

  const revert = async (tierId: string) => {
    setBusy(`revert-${tierId}`);
    setError(null);
    try {
      await post({ action: 'revert', tierId });
      setAutoLog((prev) =>
        prev.map((c) => (c.tierId === tierId && !c.reverted ? { ...c, reverted: true } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo that change.');
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
            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Zap className="h-4 w-4 text-primary" /> Automatic pricing
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Raise a tier at 25% left or selling fast (+15%, up to +50%); lower a slow
                    tier inside the last 14 days (−10%, down to −30%). Each change emails you and
                    can be undone here within 24 hours. A tier with seats held in checkout is never
                    moved.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {busy === 'auto' && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={auto}
                    disabled={busy !== null}
                    onCheckedChange={(next) => void toggleAuto(next)}
                    aria-label="Enable automatic pricing"
                  />
                </div>
              </div>

              {autoLog.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {autoLog.slice(0, 5).map((c) => {
                    const revertable =
                      !c.reverted && new Date(c.revertableUntil).getTime() >= Date.now();
                    return (
                      <li
                        key={`${c.tierId}-${c.at}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant={c.direction === 'increase' ? 'gold' : 'secondary'}>
                            {c.direction === 'increase' ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {formatCurrency(c.fromPrice, event.currency)} →{' '}
                            {formatCurrency(c.toPrice, event.currency)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {c.tierName} · {c.trigger.replace('_', ' ')}
                          </span>
                        </span>
                        {c.reverted ? (
                          <span className="text-xs text-muted-foreground">Undone</span>
                        ) : revertable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => void revert(c.tierId)}
                          >
                            {busy === `revert-${c.tierId}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Undo2 className="h-4 w-4" />
                            )}
                            Undo
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Undo window passed</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

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
