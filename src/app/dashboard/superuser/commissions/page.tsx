'use client';

import * as React from 'react';
import { Loader2, Percent } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
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
import { getOrganisers, updateUserProfile } from '@/shared/data/repositories';
import { DEFAULT_ADMIN_FEE, DEFAULT_COMMISSION_PERCENT } from '@/shared/constants/billing';
import { commissionTermsFor } from '@/shared/pricing';
import { formatCurrency } from '@/shared/utils';
import { toMajor, toMinor } from '@/shared/fees';
import type { UserProfile } from '@/shared/types';

/**
 * The white-label grant — the superuser turns it on for an organiser and sets the
 * platform's cut (a small % of face, floored at £0.50). This is the ONE place `enabled` and the platform fee fields
 * are written, through the admin-guarded endpoint (never a client write of those fields).
 * The organiser sets their own brand and booking fee from their settings.
 */
function WhiteLabelDialog({ organiser, onSaved }: { organiser: UserProfile; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const wl = organiser.whiteLabel;
  const [enabled, setEnabled] = React.useState(wl?.enabled === true);
  const [platformPct, setPlatformPct] = React.useState(wl?.platformPct ?? 2);
  const [platformMin, setPlatformMin] = React.useState(
    toMajor(wl?.platformMinPerTicketMinor ?? wl?.platformPerTicketMinor ?? 50)
  );

  const save = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/white-label-grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organiserId: organiser.uid,
          enabled,
          platformPct: Number(platformPct),
          platformMinPerTicketMinor: toMinor(Number(platformMin)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Could not save.');
      toast({ title: enabled ? 'White-label enabled' : 'White-label disabled', description: organiser.companyName ?? organiser.email });
      setOpen(false);
      onSaved();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          White-label
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>White-label for {organiser.companyName ?? organiser.fullName}</DialogTitle>
          <DialogDescription>
            Lets this organiser sell under their own brand. They set their own fan booking fee;
            you set the platform’s cut — a small % of face per paid ticket, never below the floor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            White-label enabled for this organiser
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wl-platform-pct">Platform % of face</Label>
              <Input
                id="wl-platform-pct"
                type="number"
                min={0}
                max={25}
                step="0.1"
                value={platformPct}
                onChange={(e) => setPlatformPct(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wl-platform-min">Min per ticket (£)</Label>
              <Input
                id="wl-platform-min"
                type="number"
                min={0.5}
                step="0.05"
                value={platformMin}
                onChange={(e) => setPlatformMin(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Per paid ticket: the greater of the % and the floor. Clean platform revenue — the
            organiser bears the card cost. The engine never charges below £0.50, whatever the
            floor is set to.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({
  organiser,
  onSaved,
}: {
  organiser: UserProfile;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [percent, setPercent] = React.useState(commissionTermsFor(organiser).percent);
  const [fee, setFee] = React.useState(commissionTermsFor(organiser).adminFee);

  const save = async () => {
    setSaving(true);
    try {
      await updateUserProfile(organiser.uid, {
        commissionPercent: Number(percent),
        adminFee: Number(fee),
      });
      toast({ title: 'Commission updated', description: organiser.companyName ?? organiser.email });
      setOpen(false);
      onSaved();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commission for {organiser.companyName ?? organiser.fullName}</DialogTitle>
          <DialogDescription>
            Overrides the platform default of {DEFAULT_COMMISSION_PERCENT}% plus{' '}
            {formatCurrency(DEFAULT_ADMIN_FEE)} per ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="commission-percent">Commission (%)</Label>
            <Input
              id="commission-percent"
              type="number"
              min={0}
              max={50}
              step="0.5"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-fee">Admin fee per ticket</Label>
            <Input
              id="admin-fee"
              type="number"
              min={0}
              step="0.05"
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save agreement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Commissions() {
  const [organisers, setOrganisers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    getOrganisers()
      .then(setOrganisers)
      .catch(() => setOrganisers([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Commissions</h1>
        <p className="text-sm text-muted-foreground">
          A percentage of every ticket sold, plus a fixed admin fee. Set globally, overridden per
          organiser agreement.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Platform defaults
          </CardTitle>
          <CardDescription>Applied to every organiser without a bespoke agreement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge variant="gold">Commission {DEFAULT_COMMISSION_PERCENT}%</Badge>
          <Badge variant="gold">Admin fee {formatCurrency(DEFAULT_ADMIN_FEE)} per ticket</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-organiser agreements</CardTitle>
          <CardDescription>Override the defaults for individual partners.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {organisers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No organisers registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organiser</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Admin fee</TableHead>
                  <TableHead className="text-right">Agreement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organisers.map((organiser) => {
                  const bespoke =
                    organiser.commissionPercent !== undefined || organiser.adminFee !== undefined;
                  return (
                    <TableRow key={organiser.uid}>
                      <TableCell>
                        <p className="font-medium">
                          {organiser.companyName ?? organiser.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">{organiser.email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={organiser.status === 'approved' ? 'success' : 'secondary'}>
                          {organiser.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {commissionTermsFor(organiser).percent}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(commissionTermsFor(organiser).adminFee)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {bespoke && <Badge variant="gold">Bespoke</Badge>}
                          {organiser.whiteLabel?.enabled && <Badge variant="gold">White-label</Badge>}
                          <OverrideDialog organiser={organiser} onSaved={load} />
                          <WhiteLabelDialog organiser={organiser} onSaved={load} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CommissionsPage() {
  return <RequireRole role="superuser">{() => <Commissions />}</RequireRole>;
}
