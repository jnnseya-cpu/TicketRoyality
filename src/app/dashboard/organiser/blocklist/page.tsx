'use client';

import * as React from 'react';
import { Loader2, ShieldBan, Trash2 } from 'lucide-react';

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
import type { Event, UserProfile } from '@/shared/types';

interface Entry {
  id: string;
  eventId?: string;
  kind: 'email' | 'reference';
  value: string;
  reason: string;
  createdAt: string;
}

/**
 * The blocklist an organiser actually maintains.
 *
 * The wording throughout says *refused at the door*, not *cancelled*, because that is
 * what happens: the ticket stays valid, stays refundable, and works again the moment the
 * entry is removed.
 */
function Blocklist({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [kind, setKind] = React.useState<'email' | 'reference'>('email');
  const [value, setValue] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [eventId, setEventId] = React.useState('all');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/blocklist');
      const data = (await response.json()) as { entries?: Entry[] };
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
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

  const add = async () => {
    setSaving(true);
    try {
      const response = await authedFetch('/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          value,
          reason,
          ...(eventId !== 'all' ? { eventId } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not add that entry.');

      setValue('');
      setReason('');
      toast({ title: 'Added to the blocklist', description: 'The door will refuse it.' });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not add that entry',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const response = await authedFetch(`/api/blocklist?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Could not remove that entry.');
      toast({ title: 'Removed', description: 'That ticket scans again immediately.' });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not remove that entry',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Door blocklist</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          People your doors refuse, by email address or by ticket reference. A block stops the
          scan — it does not cancel the ticket, so it stays refundable and works again the
          moment you remove the entry.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldBan className="h-5 w-5 text-primary" /> Add an entry
          </CardTitle>
          <CardDescription>
            An email follows the person across the tickets they buy. A reference stops one
            specific ticket. Neither stops somebody using a new address — this refuses the
            person who walks up with the ticket they bought.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Match on</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as 'email' | 'reference')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email address</SelectItem>
                <SelectItem value="reference">Ticket reference</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-value">{kind === 'email' ? 'Email' : 'Reference'}</Label>
            <Input
              id="block-value"
              value={value}
              placeholder={kind === 'email' ? 'someone@example.com' : 'TR-4F2A9C'}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="block-reason">Reason</Label>
            <Input
              id="block-reason"
              value={reason}
              placeholder="Shown to door staff"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="sm:col-span-4">
            <Button onClick={add} disabled={saving || !value.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add to blocklist
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nobody is blocked. Your doors admit every valid ticket.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="secondary">
                        {entry.kind === 'email' ? 'Email' : 'Reference'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.eventId
                        ? (events.find((e) => e.id === entry.eventId)?.title ?? 'One event')
                        : 'Every event'}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                      {entry.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(entry.id)}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BlocklistPage() {
  return <RequireRole role="organiser">{(profile) => <Blocklist profile={profile} />}</RequireRole>;
}
