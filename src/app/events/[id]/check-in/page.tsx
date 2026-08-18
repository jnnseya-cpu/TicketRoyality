import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Logo } from '@/frontend/components/common/Logo';
import { TicketScanner } from '@/frontend/components/dashboard/TicketScanner';
import { WristbandDesk } from '@/frontend/components/dashboard/WristbandDesk';
import { getEventById } from '@/shared/data/repositories';
import { formatEventDate } from '@/shared/utils';

export const metadata: Metadata = {
  title: 'Check-in portal',
  robots: { index: false, follow: false },
};

/**
 * Standalone check-in portal.
 *
 * The organiser shares this link with gate staff. It exposes the scanner for one
 * event and nothing else — no sales figures, no customer records, no access to the
 * organiser's other events or finances.
 */
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  return (
    <div className="container max-w-2xl py-12">
      <div className="mb-6 flex items-center gap-2">
        <Logo className="h-6 w-6" />
        <span className="font-headline font-bold">
          Ticket<span className="text-primary">Royality</span>
        </span>
        <span className="ml-auto text-xs uppercase tracking-widest text-muted-foreground">
          Check-in portal
        </span>
      </div>

      <h1 className="font-headline text-2xl font-bold">{event.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatEventDate(event.date)} · {event.location}
      </p>

      <Alert className="my-6">
        <ShieldCheck />
        <AlertTitle>Scoped access</AlertTitle>
        <AlertDescription>
          This page validates tickets for this event only. It gives no access to the organiser
          dashboard, customer records or financial data.
        </AlertDescription>
      </Alert>

      <TicketScanner
        eventId={event.id}
        eventTitle={event.title}
        zones={event.zones ?? []}
        sessions={event.sessions ?? []}
      />

      {/* Bands are a second door, not a replacement: a venue usually runs both, QR at the
          box office and tags at the barrier. */}
      <div className="mt-6">
        <WristbandDesk eventId={event.id} />
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Problem at the gate?{' '}
        <Link href={`/events/${event.id}`} className="text-primary hover:underline">
          View the event page
        </Link>
      </p>
    </div>
  );
}
