import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { certificateCodeValid } from '@/backend/services/certificates';
import { sessionsAttended } from '@/backend/services/sessions';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { EventSession } from '@/shared/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Certificate of attendance',
  robots: { index: false, follow: false },
};

/**
 * The certificate itself — a page, deliberately (see certificates.ts).
 *
 * Renders only under a valid HMAC code; anything else is a plain 404, indistinguishable
 * from a ticket that never existed, because a verifier probing ids must learn nothing.
 * Print-styled: File → Print → Save as PDF is the export, on every machine, with no PDF
 * dependency to maintain and no stored file to go stale — the page re-renders from the
 * attendance records every time, so it is always as true as the door scans it stands on.
 */
export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { ticketId } = await params;
  const { code } = await searchParams;

  if (!isAdminConfigured() || !code || !certificateCodeValid(ticketId, code)) notFound();

  const snap = await getAdminDb().collection('tickets').doc(ticketId).get();
  if (!snap.exists) notFound();

  const ticket = snap.data() as {
    attendeeName?: string;
    eventId: string;
    eventTitle?: string;
    eventDate?: string;
    eventLocation?: string;
    organizerName?: string;
    tierName?: string;
    status?: string;
    redeemedAt?: string;
    reference?: string;
  };
  if (ticket.status !== 'redeemed') notFound();

  const attended = await sessionsAttended(ticketId);
  let sessionTitles: Array<{ title: string; at: string }> = [];
  if (attended.length > 0) {
    const eventSnap = await getAdminDb().collection('events').doc(ticket.eventId).get();
    const sessions = (eventSnap.data()?.sessions ?? []) as EventSession[];
    sessionTitles = attended
      .map((entry) => ({
        title: sessions.find((s) => s.id === entry.sessionId)?.title ?? '',
        at: entry.at,
      }))
      .filter((entry) => entry.title);
  }

  const eventDay = ticket.eventDate
    ? new Date(ticket.eventDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 print:py-0">
      <div className="rounded-xl border-2 border-primary/40 p-10 print:rounded-none print:border print:border-black">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          TicketRoyality · Certificate of attendance
        </p>

        <h1 className="mt-8 font-headline text-3xl font-bold">{ticket.attendeeName ?? 'Attendee'}</h1>

        <p className="mt-4 text-lg">
          attended <span className="font-semibold">{ticket.eventTitle ?? 'the event'}</span>
          {ticket.organizerName ? <> presented by {ticket.organizerName}</> : null}
          {eventDay ? <> on {eventDay}</> : null}
          {ticket.eventLocation ? <> at {ticket.eventLocation}</> : null}.
        </p>

        {sessionTitles.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Sessions attended
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {sessionTitles.map((session) => (
                <li key={`${session.title}-${session.at}`}>{session.title}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 grid gap-1 border-t border-border pt-4 text-xs text-muted-foreground">
          {/*
            What a verifier needs and nothing else. Entry was recorded at the door scan;
            the reference ties this page to a real ticket; the code in the URL is the
            proof the page was not typed up by hand.
          */}
          {ticket.redeemedAt ? (
            <span>
              Entry recorded{' '}
              {new Date(ticket.redeemedAt).toLocaleString('en-GB', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </span>
          ) : null}
          {ticket.reference ? <span>Ticket reference {ticket.reference}</span> : null}
          <span>
            Verify: reopen this page&apos;s full link — it renders only with a valid code, from
            the attendance records themselves.
          </span>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground print:hidden">
        Print this page, or use your browser&apos;s &ldquo;Save as PDF&rdquo;, to keep a copy.
      </p>
    </div>
  );
}
