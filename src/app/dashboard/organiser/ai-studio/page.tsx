'use client';

import * as React from 'react';
import Link from 'next/link';
import { Copy, Loader2, Sparkles, Wallet } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { useToast } from '@/hooks/use-toast';
import { MARKUP_MULTIPLIER, acuToUsd } from '@/shared/constants/billing';
import type { UserProfile } from '@/shared/types';

interface AdCopy {
  headline: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  billing?: { acu: number; providerCostUsd: number; userChargeUsd: number };
}

function AiStudio({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    eventName: '',
    eventDescription: '',
    targetAudience: '',
    channel: 'instagram',
    tone: '',
  });
  const [result, setResult] = React.useState<AdCopy | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const balance = profile.wallet?.balanceAcu ?? 0;
  const insufficient = balance <= 0;

  const generate = async () => {
    if (insufficient) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'ad-copy', input: form }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          response.status === 503
            ? 'The model is busy or not configured. Try again in a moment.'
            : (data as { error?: string }).error ?? 'Generation failed.'
        );
      }
      setResult(data as AdCopy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!result) return;
    const text = `${result.headline}\n\n${result.body}\n\n${result.callToAction}\n\n${result.hashtags
      .map((tag) => `#${tag}`)
      .join(' ')}`;
    void navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold">AI studio</h1>
          <p className="text-sm text-muted-foreground">
            Generate campaign copy for Facebook, Instagram, X or email.
          </p>
        </div>
        <Badge variant="gold" className="gap-1">
          <Wallet className="h-3 w-3" /> {balance} ACU (${acuToUsd(balance).toFixed(2)})
        </Badge>
      </div>

      {insufficient && (
        <Alert variant="warning">
          <Wallet />
          <AlertTitle>Out of AI credit</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              AI features stop when your ACU balance reaches zero. Calls are billed at the provider
              cost multiplied by {MARKUP_MULTIPLIER}.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/customer/wallet">Top up credit</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign brief</CardTitle>
            <CardDescription>The more specific, the better the output.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-event-name">Event name</Label>
              <Input
                id="ai-event-name"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                placeholder="Royal Night Live — Wembley Stadium"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-description">What happens at the event</Label>
              <Textarea
                id="ai-description"
                rows={4}
                value={form.eventDescription}
                onChange={(e) => setForm({ ...form, eventDescription: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-audience">Target audience</Label>
              <Input
                id="ai-audience"
                value={form.targetAudience}
                onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                placeholder="25–40, live music fans within 30 miles of London"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={form.channel}
                  onValueChange={(v) => setForm({ ...form, channel: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="twitter">X / Twitter</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-tone">Tone (optional)</Label>
                <Input
                  id="ai-tone"
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })}
                  placeholder="Urgent, premium"
                />
              </div>
            </div>

            <Button
              variant="royal"
              className="w-full"
              onClick={generate}
              disabled={loading || insufficient || !form.eventName || !form.eventDescription}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate ad copy
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Generated copy</CardTitle>
              <CardDescription>Review and edit before you publish.</CardDescription>
            </div>
            {result && (
              <Button size="sm" variant="outline" onClick={copyAll}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <Sparkles />
                <AlertTitle>Could not generate</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!result && !error && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Fill in the brief and generate to see results here.
              </p>
            )}

            {result && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Headline</p>
                  <p className="font-headline text-lg font-semibold">{result.headline}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Body</p>
                  <p className="whitespace-pre-line text-sm">{result.body}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Call to action
                  </p>
                  <p className="text-sm font-medium text-primary">{result.callToAction}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.hashtags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
                {result.billing && (
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    Billed {result.billing.acu} ACU · provider cost $
                    {result.billing.providerCostUsd.toFixed(5)} × {MARKUP_MULTIPLIER}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AiStudioPage() {
  return <RequireRole role="organiser">{(profile) => <AiStudio profile={profile} />}</RequireRole>;
}
