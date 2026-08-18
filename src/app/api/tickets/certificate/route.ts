import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { certificateCode } from '@/backend/services/certificates';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mints the certificate link for one ticket.
 *
 * Authenticated, and only for the ticket's owner or the event's organiser — the page
 * itself is then readable by anyone holding the link, which is the point of it (see
 * certificates.ts). Requires the ticket to have been used: a certificate of attendance
 * for someone who never arrived is exactly the document this feature must not produce.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }

  const ticketId = new URL(request.url).searchParams.get('ticketId') ?? '';
  if (!ticketId) return NextResponse.json({ error: 'No ticket given.' }, { status: 400 });

  const snap = await getAdminDb().collection('tickets').doc(ticketId).get();
  if (!snap.exists) return NextResponse.json({ error: 'No such ticket.' }, { status: 404 });

  const ticket = snap.data() as { userId?: string; organizerId?: string; status?: string };
  if (ticket.userId !== caller.uid && ticket.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'Not your ticket.' }, { status: 403 });
  }
  if (ticket.status !== 'redeemed') {
    return NextResponse.json(
      { error: 'Certificates are issued on attendance — this ticket was never scanned in.' },
      { status: 409 }
    );
  }

  const code = certificateCode(ticketId);
  if (!code) {
    return NextResponse.json(
      { error: 'Certificates are not configured (QR_SIGNING_KEY is unset).' },
      { status: 503 }
    );
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return NextResponse.json({ ok: true, url: `${site}/certificates/${ticketId}?code=${code}` });
}
