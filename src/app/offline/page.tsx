import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

/**
 * The offline fallback, precached by the service worker.
 *
 * Deliberately says what *does* still work rather than only apologising. The one thing
 * somebody needs when they are offline at a venue is their ticket, and a page already
 * visited is still in the cache — telling them that is more useful than a spinner.
 */
export default function OfflinePage() {
  return (
    <div className="container flex min-h-[70vh] max-w-md flex-col items-center justify-center py-12 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 font-headline text-2xl font-bold">You are offline</h1>
      <p className="mt-2 text-muted-foreground">
        This page needs a connection. Pages you have already opened still work, including
        tickets you have viewed on this device.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild variant="royal">
          <Link href="/dashboard/customer">My tickets</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        At the door with no signal? Staff can look your ticket up by the reference in your
        confirmation email.
      </p>
    </div>
  );
}
