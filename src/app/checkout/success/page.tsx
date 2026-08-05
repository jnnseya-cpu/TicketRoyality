import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Payment complete' };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; provider?: string }>;
}) {
  const { session_id: sessionId, provider } = await searchParams;

  return (
    <div className="container flex min-h-[60vh] max-w-lg items-center py-12">
      <Card className="w-full border-success/40">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <CardTitle>Payment received</CardTitle>
          <CardDescription>
            Your tickets are being issued
            {provider ? ` via ${provider}` : ''}. They appear in your dashboard within a few
            seconds, and a copy is emailed to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionId && (
            <p className="break-all rounded-md bg-secondary p-3 text-center text-xs text-muted-foreground">
              Reference: {sessionId}
            </p>
          )}
          <Button variant="royal" className="w-full" asChild>
            <Link href="/dashboard/customer">View my tickets</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/events">Keep browsing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
