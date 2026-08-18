'use client';

import * as React from 'react';
import { Check, Copy, Link2, Loader2, Pause, Play } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { toMajor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';
import type { Event, PartnerKind, PartnerLink, UserProfile } from '@/shared/types';

type LinkRow = PartnerLink & { statsKey: string };

const KINDS: Array<{ value: PartnerKind; label: string; hint: string }> = [
  { value: 'affiliate', label: 'Affiliate', hint: 'A site or publisher sending traffic.' },
  { value: 'influencer', label: 'Influencer', hint: 'A creator posting your event.' },
  { value: 'promoter', label: 'Promoter', hint: 'Give them an allocation to sell.' },
  { value: 'sponsor', label: 'Sponsor', hint: 'Usually 0% — measured, not paid.' },
  { value: 'referral', label: 'Referral', hint: 'A customer bringing friends.' },
];

/**
 * Partner links: create, share, watch, pause.
 *
 * The commission line is worded carefully throughout. The platform takes nothing, so a
 * partner's cut comes out of the organiser's own payout — stating it as a platform
 * deduction would contradict the "you keep 100%" promise and quietly make it false.
 */
function Partners({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [links, setLinks] = React.useState<LinkRow[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  const [code, setCode] = React.useState('');
  const [kind, setKind] = React.useState<PartnerKind>('affiliate');
  const [partnerName, setPartnerName] = React.useState('');
  const [partnerEmail, setPartnerEmail] = React.useState('');
  const [eventId, setEventId] = React.useState('all');
  const [commissionPercent, setCommissionPercent] = React.useState('10');
  const [allocation, setAllocation] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/partners');
      const data = (await response.json()) as { links?: LinkRow[] };
      setLinks(data.links ?? []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    getEventsByOrganizer(profile.uid)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [load, profile.uid]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const create = async () => {
    setSaving(true);
    try {
      const response = await authedFetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          kind,
          partnerName,
          partnerEmail,
          commissionPercent: Number(commissionPercent),
          ...(eventId !== 'all' ? { eventId } : {}),
          ...(kind === 'promoter' && allocation ? { allocation: Number(allocation) } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not create that link.');

      setCode('');
      setPartnerName('');
      setPartnerEmail('');
      setAllocation('');
      toast({ title: 'Link created', description: 'Send it to your partner.' });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create that link',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (link: LinkRow) => {
    await authedFetch('/api/partners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: link.code, active: !link.active }),
    });
    await load();
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy', description: text });
    }
  };

  const owed = links.reduce((sum, l) => sum + l.commissionMinor, 0);
  const currency = events[0]?.currency ?? 'GBP';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Partners</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Tracked links for affiliates, influencers, promoters, sponsors and customers who bring
          friends. Clicks and sales are attributed server-side; commission is recorded as owed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> New link
          </CardTitle>
          <CardDescription>
            {KINDS.find((k) => k.value === kind)?.hint} Commission is a percentage of ticket
            value and comes out of your payout — we take nothing from it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-code">Code</Label>
            <Input
              id="p-code"
              value={code}
              placeholder="SARAH10"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-pct">Commission %</Label>
            <Input
              id="p-pct"
              type="number"
              min={0}
              max={50}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Partner name</Label>
            <Input id="p-name" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Partner email</Label>
            <Input
              id="p-email"
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Earns on</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every event I run</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === 'promoter' && (
            <div className="space-y-1.5">
              <Label htmlFor="p-alloc">Allocation</Label>
              <Input
                id="p-alloc"
                type="number"
                min={1}
                value={allocation}
                placeholder="Tickets they may sell"
                onChange={(e) => setAllocation(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Past it, sales still go through — they just stop earning.
              </p>
            </div>
          )}

          <div className="sm:col-span-3">
            <Button onClick={create} disabled={saving || !code.trim() || !partnerName.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create link
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : links.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No partner links yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-primary/30">
            <CardContent className="p-5 text-sm">
              <span className="font-semibold">{formatCurrency(toMajor(owed), currency)}</span>{' '}
              owed to partners across all links. TicketRoyality records this; paying it is
              between you and them.
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                    <TableHead>Links</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => {
                    const share = `${origin}/r/${link.code}`;
                    const stats = `${origin}/partners/${link.code}?k=${link.statsKey}`;
                    return (
                      <TableRow key={link.code} className={link.active ? undefined : 'opacity-60'}>
                        <TableCell>
                          <span className="font-mono text-xs font-medium">{link.code}</span>
                          <Badge variant="secondary" className="ml-2 capitalize">
                            {link.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{link.partnerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {link.commissionPercent}%
                            {link.allocation !== undefined
                              ? ` · ${link.ticketsSold}/${link.allocation} allocation`
                              : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{link.clicks}</TableCell>
                        <TableCell className="text-right tabular-nums">{link.ticketsSold}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(toMajor(link.commissionMinor), currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => copy(share, `s-${link.code}`)}>
                              {copied === `s-${link.code}` ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              Share
                            </Button>
                            {/* The partner's own page. No account needed — see the page. */}
                            <Button variant="ghost" size="sm" onClick={() => copy(stats, `k-${link.code}`)}>
                              {copied === `k-${link.code}` ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              Stats
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => toggle(link)}>
                            {link.active ? (
                              <>
                                <Pause className="h-3.5 w-3.5" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5" /> Resume
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function PartnersPage() {
  return <RequireRole role="organiser">{(profile) => <Partners profile={profile} />}</RequireRole>;
}
