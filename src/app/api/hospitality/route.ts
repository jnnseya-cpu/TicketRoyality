import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import {
  bookingsForEvent,
  bookingsForUser,
  bookTable,
  cancelBooking,
  setGuests,
} from '@/backend/services/hospitality';
import type { HospitalityGuest } from '@/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hospitality bookings.
 *
 * Every action proves who the caller is from a verified token, and ownership is checked
 * inside the service against the stored document — never from a field in the request. A
 * route that accepted a `buyerUserId` would let anyone edit anyone's guest list.
 *
 * Nothing here moves money. Reserving a table places an inventory hold; paying for it
 * goes through `/api/hospitality/pay`, which prices the payment server-side and hands
 * the buyer to Stripe.
 */

/** GET — the caller's own bookings, or an event's table plan if they organise it. */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ bookings: await bookingsForUser(caller.uid) });

  // The organiser's view is gated on actually owning the event, read from Firestore.
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Bookings are unavailable.' }, { status: 503 });
  }
  const snap = await getAdminDb().collection('events').doc(eventId).get();
  if (!snap.exists) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
  if (snap.data()?.organizerId !== caller.uid) {
    return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
  }

  return NextResponse.json({ bookings: await bookingsForEvent(eventId) });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    action?: 'book' | 'guests' | 'cancel';
    eventId?: string;
    packageId?: string;
    bookingId?: string;
    guests?: HospitalityGuest[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'book') {
    if (!caller.email) {
      return NextResponse.json(
        { error: 'Your account needs an email address to hold a booking against.' },
        { status: 400 }
      );
    }
    const result = await bookTable(
      String(body.eventId ?? ''),
      String(body.packageId ?? ''),
      caller.uid,
      caller.email
    );
    return result.ok
      ? NextResponse.json({
          ok: true,
          bookingId: result.bookingId,
          depositMinor: result.depositMinor,
          totalMinor: result.totalMinor,
        })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'guests') {
    const result = await setGuests(
      String(body.bookingId ?? ''),
      caller.uid,
      Array.isArray(body.guests) ? body.guests.slice(0, 100) : []
    );
    return result.ok
      ? NextResponse.json({ ok: true, count: result.count })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'cancel') {
    const result = await cancelBooking(String(body.bookingId ?? ''), caller.uid);
    return result.ok
      ? NextResponse.json({ ok: true, refundOwedMinor: result.refundOwedMinor })
      : NextResponse.json({ error: 'That booking could not be cancelled.' }, { status: 409 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
