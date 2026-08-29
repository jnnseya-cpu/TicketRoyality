import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { sellAtDoor, verifyBoxOfficePin } from '@/backend/services/box-office';
import { reportError } from '@/backend/observability/report-error';
import type { BoxOfficeTender } from '@/shared/types';

export const dynamic = 'force-dynamic';

const TENDERS: BoxOfficeTender[] = ['cash', 'card', 'mobile_money'];

/**
 * Sell a ticket at the door. Two ways in, both authorised server-side:
 *  - an authenticated organiser who owns the event (the dashboard), or
 *  - a valid per-event Box-Office PIN (the scoped gate-staff link).
 * A guessable URL alone can never mint a ticket or owe money.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Ticketing is not configured.' }, { status: 503 });
  }

  let body: {
    eventId?: string;
    tierId?: string;
    quantity?: number;
    tender?: string;
    buyerName?: string;
    buyerEmail?: string;
    pin?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const eventId = String(body.eventId ?? '');
  const tierId = String(body.tierId ?? '');
  const tender = String(body.tender ?? '') as BoxOfficeTender;
  if (!eventId || !tierId) return NextResponse.json({ error: 'Missing event or ticket type.' }, { status: 400 });
  if (!TENDERS.includes(tender)) return NextResponse.json({ error: 'Choose how the money was taken.' }, { status: 400 });

  // Authorise: PIN first (staff link), else the owning organiser (dashboard).
  let soldBy: string;
  if (typeof body.pin === 'string' && body.pin.length > 0) {
    const ok = await verifyBoxOfficePin(eventId, body.pin);
    if (!ok) return NextResponse.json({ error: 'Wrong door PIN.' }, { status: 401 });
    soldBy = 'door';
  } else {
    const caller = await requireUser(request);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
    const eventSnap = await getAdminDb().collection('events').doc(eventId).get();
    if (!eventSnap.exists || eventSnap.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'Not your event.' }, { status: 403 });
    }
    soldBy = caller.uid;
  }

  try {
    const result = await sellAtDoor({
      eventId,
      tierId,
      quantity: Number(body.quantity ?? 1),
      tender,
      soldBy,
      buyerName: typeof body.buyerName === 'string' ? body.buyerName.slice(0, 120) : undefined,
      buyerEmail: typeof body.buyerEmail === 'string' ? body.buyerEmail.slice(0, 160) : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    reportError(error, { scope: 'box-office.sell', eventId });
    return NextResponse.json({ error: 'The sale could not be completed.' }, { status: 500 });
  }
}
