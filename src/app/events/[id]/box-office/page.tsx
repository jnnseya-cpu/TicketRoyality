import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Store } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Logo } from '@/frontend/components/common/Logo';
import { BoxOfficeStaff } from '@/frontend/components/dashboard/BoxOfficeStaff';
import { getEventById } from '@/shared/data/repositories';
import { formatEventDate } from '@/shared/utils';

export const metadata: Metadata = {
  title: 'Box office',
  robots: { index: false, follow: false },
};

/**
 * Standalone box-office portal for gate staff — the selling twin of the check-in portal.
 *
 * The organiser shares this link and a PIN. The page shows the sell form for one event and
 * nothing else — no sales figures, no other events, no dashboard. Every sale is authorised
 * server-side against the event's PIN, so the link alone can neither mint a ticket nor owe
 * money in the organiser's name.
 */
export default async function BoxOfficePortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  return (
    <div className="container max-w-lg py-10">
      <div className="mb-6 flex items-center gap-2">
        <Logo className="h-6 w-6" />
        <span className="font-headline font-bold">
          Ticket<span className="text-primary">Royality</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
          <Store className="h-3 w-3" /> Box office
        </span>
      </div>

      <h1 className="font-headline text-2xl font-bold">{event.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatEventDate(event.date)} · {event.location}
      </p>

      <Alert className="my-6">
        <Store />
        <AlertTitle>Door sales</AlertTitle>
        <AlertDescription>
          Sell tickets for this event at the door. Each one is a real, counted, scannable
          ticket at the same price as online. Cash, card or mobile money — you collect the
          money; the platform records it.
        </AlertDescription>
      </Alert>

      <BoxOfficeStaff eventId={event.id} currency={event.currency} tiers={event.ticketTiers} />
    </div>
  );
}
