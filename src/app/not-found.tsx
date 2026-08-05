import Link from 'next/link';
import { SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
      <SearchX className="mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="font-headline text-3xl font-bold">Nothing here</h1>
      <p className="mt-3 text-muted-foreground">
        This page does not exist, or the event has been removed by its organiser.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="royal" asChild>
          <Link href="/events">Browse events</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
