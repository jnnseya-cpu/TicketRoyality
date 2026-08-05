'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CreditCard, Loader2, Minus, Plus, ShoppingCart, Trash2, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';
import { useToast } from '@/hooks/use-toast';
import { findCouponByCode } from '@/server/database';
import { formatCurrency, formatEventDate } from '@/lib/utils';
import type { Coupon } from '@/shared/types';

export default function CartPage() {
  const { items, subtotal, currency, updateQuantity, removeItem, clear } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();

  const [couponCode, setCouponCode] = React.useState('');
  const [coupon, setCoupon] = React.useState<Coupon | null>(null);
  const [checkingCoupon, setCheckingCoupon] = React.useState(false);
  const [bitripayLoading, setBitripayLoading] = React.useState(false);

  const discount = React.useMemo(() => {
    if (!coupon) return 0;
    return coupon.discountType === 'percentage'
      ? (subtotal * coupon.amount) / 100
      : Math.min(coupon.amount, subtotal);
  }, [coupon, subtotal]);

  const total = Math.max(0, subtotal - discount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    try {
      const found = await findCouponByCode(couponCode.trim());
      if (!found) {
        toast({ variant: 'destructive', title: 'Coupon not found', description: couponCode });
        return;
      }
      if (new Date(found.expiresAt).getTime() < Date.now()) {
        toast({ variant: 'destructive', title: 'Coupon expired' });
        return;
      }
      if (found.usageCount >= found.usageLimit) {
        toast({ variant: 'destructive', title: 'Coupon fully redeemed' });
        return;
      }
      setCoupon(found);
      toast({ title: 'Coupon applied', description: found.code });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not check that coupon',
        description: 'Coupon validation requires a signed-in account.',
      });
    } finally {
      setCheckingCoupon(false);
    }
  };

  const handleBitripay = async () => {
    setBitripayLoading(true);
    try {
      const response = await fetch('/api/bitripay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          currency: 'USD',
          reference: `cart:${user?.uid ?? 'guest'}`,
        }),
      });
      const data = (await response.json()) as { paymentUrl?: string; error?: string };
      if (!response.ok || !data.paymentUrl) throw new Error(data.error ?? 'Bitripay unavailable.');
      window.location.href = data.paymentUrl;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Bitripay checkout failed',
        description: error instanceof Error ? error.message : 'Try Stripe instead.',
      });
      setBitripayLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container flex min-h-[55vh] max-w-lg flex-col items-center justify-center py-12 text-center">
        <ShoppingCart className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="font-headline text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">
          Find something worth queueing for and it will show up here.
        </p>
        <Button variant="royal" className="mt-6" asChild>
          <Link href="/events">Browse events</Link>
        </Button>
      </div>
    );
  }

  // Stripe checkout is a plain form POST so the redirect stays inside the click gesture.
  const stripePayload = JSON.stringify(
    items.map((item) => ({
      eventTitle: item.eventTitle,
      tierName: item.tierName,
      // Discount is spread proportionally across line items.
      price: subtotal > 0 ? item.price * (total / subtotal) : 0,
      quantity: item.quantity,
      currency: item.currency,
    }))
  );

  return (
    <div className="container max-w-5xl py-12">
      <h1 className="mb-8 font-headline text-3xl font-bold">Your cart</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={`${item.eventId}-${item.tierId}`}>
              <CardContent className="flex gap-4 p-4">
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={item.imageUrl}
                    alt={item.eventTitle}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/events/${item.eventId}`}
                    className="font-medium hover:text-primary"
                  >
                    {item.eventTitle}
                  </Link>
                  <p className="text-sm text-muted-foreground">{item.tierName}</p>
                  <p className="text-xs text-muted-foreground">{formatEventDate(item.eventDate)}</p>

                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.eventId, item.tierId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.eventId, item.tierId, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => removeItem(item.eventId, item.tierId)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <p className="shrink-0 font-semibold">
                  {formatCurrency(item.price * item.quantity, item.currency)}
                </p>
              </CardContent>
            </Card>
          ))}

          <Button variant="ghost" size="sm" onClick={clear}>
            Clear cart
          </Button>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon">Promo code</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="ROYAL10"
                />
                <Button variant="outline" onClick={applyCoupon} disabled={checkingCoupon}>
                  {checkingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {coupon && (
                <div className="flex justify-between text-success">
                  <span>Discount ({coupon.code})</span>
                  <span>-{formatCurrency(discount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total, currency)}</span>
              </div>
            </div>

            <form action="/api/checkout" method="POST">
              <input type="hidden" name="items" value={stripePayload} />
              <input type="hidden" name="userId" value={user?.uid ?? ''} />
              <Button type="submit" variant="royal" className="w-full">
                <CreditCard className="h-4 w-4" /> Checkout with Stripe
              </Button>
            </form>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleBitripay}
              disabled={bitripayLoading}
            >
              {bitripayLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              Checkout with Bitripay
            </Button>

            {!user && (
              <p className="text-center text-xs text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Log in
                </Link>{' '}
                so your tickets are saved to your account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
