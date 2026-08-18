'use client';

import * as React from 'react';
import { AlertCircle, Download, HeartHandshake, Loader2 } from 'lucide-react';

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
import { formatCurrency } from '@/shared/utils';
import type { ClaimSummary } from '@/shared/gift-aid';

/**
 * What the charity can claim, and what it cannot.
 *
 * ## Why the excluded gifts are as prominent as the claimable ones
 *
 * "£4,000 claimable" is a number. "£4,000 claimable, and £600 more if eleven donors
 * complete a declaration" is a number somebody can act on by sending eleven emails, which
 * is the entire value of showing this at all. A dashboard that reports only the good
 * total quietly costs the charity the difference every year.
 */
export function GiftAidClaim() {
  const [summary, setSummary] = React.useState<ClaimSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [range, setRange] = React.useState({ from: '', to: '' });

  const query = React.useMemo(() => {
    const parts: string[] = [];
    if (range.from) parts.push(`from=${encodeURIComponent(range.from)}`);
    if (range.to) parts.push(`to=${encodeURIComponent(`${range.to}T23:59:59.999Z`)}`);
    return parts.join('&');
  }, [range]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch(`/api/giving?view=claim&${query}`);
      if (!response.ok) throw new Error('unavailable');
      const data = (await response.json()) as { summary: ClaimSummary };
      setSummary(data.summary);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /*
   * The CSV is fetched with the caller's token and handed to the browser as a blob: a
   * plain link would hit the route unauthenticated, and the route would rightly refuse.
   */
  const download = async () => {
    const response = await authedFetch(`/api/giving?view=claim&format=csv&${query}`);
    if (!response.ok) return;

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gift-aid-claim.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const excluded = summary
    ? Object.entries(summary.excluded).filter(([, v]) => v.count > 0)
    : [];

  const reasonText: Record<string, string> = {
    'no-declaration': 'no Gift Aid declaration',
    'benefit-too-large': 'the donor received too much in return to count as a gift',
    'before-declaration': 'given before the declaration covered them',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartHandshake className="h-4 w-4 text-primary" /> Gift Aid
        </CardTitle>
        <CardDescription>
          25% on donations from UK taxpayers who have declared. Ticket sales are never
          included — Gift Aid is claimed on a gift, never on a payment for admission.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-9 w-40"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-9 w-40"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void download()}>
            <Download className="h-3.5 w-3.5" /> Claim schedule (CSV)
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : failed ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> We could not read your donations just now.
          </p>
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Figure label="Claimable donations" value={formatCurrency(summary.claimableMinor / 100)} />
              <Figure
                label="You can reclaim"
                value={formatCurrency(summary.reclaimMinor / 100)}
                emphasis
              />
              <Figure label="Gifts in the claim" value={String(summary.count)} />
            </div>

            {excluded.length > 0 && (
              <div className="space-y-1 rounded-md border border-dashed border-border p-3">
                <p className="text-xs font-medium">Not in the claim</p>
                {excluded.map(([reason, value]) => (
                  <p key={reason} className="text-xs text-muted-foreground">
                    {formatCurrency(value.amountMinor / 100)} across {value.count} gift
                    {value.count === 1 ? '' : 's'} — {reasonText[reason] ?? reason}.
                  </p>
                ))}
              </div>
            )}

            {/*
              Said once, where the claim is made. The arithmetic here is ours; the
              entitlement is not, and a charity that files on our say-so and is audited
              carries it themselves.
            */}
            <p className="text-xs text-muted-foreground">
              This produces the schedule and the arithmetic. It is not tax advice — your own
              accountant signs off a claim, and HMRC&rsquo;s rates and rules change.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasis
            ? 'font-headline text-2xl font-bold text-primary'
            : 'font-headline text-2xl font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}
