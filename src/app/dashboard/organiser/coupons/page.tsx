'use client';

import * as React from 'react';
import { Loader2, PlusCircle, TicketPercent } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { useToast } from '@/hooks/use-toast';
import { createCoupon, getCouponsForOrganizer } from '@/server/database';
import type { Coupon, UserProfile } from '@/shared/types';

function CreateCouponDialog({
  organizerId,
  onCreated,
}: {
  organizerId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    code: '',
    discountType: 'percentage' as Coupon['discountType'],
    amount: 10,
    usageLimit: 100,
    expiresAt: '',
  });

  const submit = async () => {
    if (form.code.trim().length < 3) {
      toast({ variant: 'destructive', title: 'Code too short' });
      return;
    }
    setSaving(true);
    try {
      await createCoupon({
        code: form.code.trim().toUpperCase(),
        organizerId,
        discountType: form.discountType,
        amount: Number(form.amount),
        usageLimit: Number(form.usageLimit),
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : new Date(Date.now() + 90 * 86_400_000).toISOString(),
        scope: 'organiser',
      });
      toast({ title: 'Coupon created', description: form.code.toUpperCase() });
      setOpen(false);
      onCreated();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create coupon',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="royal">
          <PlusCircle className="h-4 w-4" /> Create coupon
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New discount coupon</DialogTitle>
          <DialogDescription>
            Applied at checkout across all of your events.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="coupon-code">Code</Label>
            <Input
              id="coupon-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="ROYAL10"
            />
          </div>
          <div className="space-y-2">
            <Label>Discount type</Label>
            <Select
              value={form.discountType}
              onValueChange={(v) => setForm({ ...form, discountType: v as Coupon['discountType'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage off</SelectItem>
                <SelectItem value="fixed">Fixed amount off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-amount">Amount</Label>
            <Input
              id="coupon-amount"
              type="number"
              min={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-limit">Usage limit</Label>
            <Input
              id="coupon-limit"
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-expiry">Expires</Label>
            <Input
              id="coupon-expiry"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create coupon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CouponTable({ coupons }: { coupons: Coupon[] }) {
  if (coupons.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <TicketPercent className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No coupons here yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead className="text-right">Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => {
              const expired = new Date(coupon.expiresAt).getTime() < Date.now();
              const exhausted = coupon.usageCount >= coupon.usageLimit;
              return (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-medium">{coupon.code}</TableCell>
                  <TableCell>
                    {coupon.discountType === 'percentage'
                      ? `${coupon.amount}% off`
                      : `${coupon.amount} off`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {coupon.usageCount} / {coupon.usageLimit}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(coupon.expiresAt).toDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={expired || exhausted ? 'secondary' : 'success'}>
                      {expired ? 'Expired' : exhausted ? 'Fully used' : 'Active'}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OrganiserCoupons({ profile }: { profile: UserProfile }) {
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    getCouponsForOrganizer(profile.uid)
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }, [profile.uid]);

  React.useEffect(() => load(), [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Discount codes and exclusive-access offers for your events.
          </p>
        </div>
        <CreateCouponDialog organizerId={profile.uid} onCreated={load} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My coupons</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace coupons</TabsTrigger>
          </TabsList>
          <TabsContent value="mine">
            <CouponTable coupons={coupons.filter((c) => c.scope === 'organiser')} />
          </TabsContent>
          <TabsContent value="marketplace">
            <CouponTable coupons={coupons.filter((c) => c.scope === 'marketplace')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function OrganiserCouponsPage() {
  return (
    <RequireRole role="organiser">{(profile) => <OrganiserCoupons profile={profile} />}</RequireRole>
  );
}
