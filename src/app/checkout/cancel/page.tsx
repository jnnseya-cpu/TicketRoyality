import Link from 'next/link';
import type { Metadata } from 'next';
import { XCircle } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';

export const metadata: Metadata = { title: 'Payment cancelled' };

export default async function CheckoutCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="container flex min-h-[60vh] max-w-lg items-center py-12">
      <Card className="w-full border-destructive/40">
        <CardHeader className="items-center text-center">
          <XCircle className="h-10 w-10 text-destructive" />
          <CardTitle>Payment not completed</CardTitle>
          <CardDescription>
            Nothing was charged. Your cart is still intact, so you can try again whenever you like.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reason && (
            <p className="rounded-md bg-secondary p-3 text-center text-xs text-muted-foreground">
              {reason}
            </p>
          )}
          <Button variant="royal" className="w-full" asChild>
            <Link href="/cart">Back to cart</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/events">Browse events</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
