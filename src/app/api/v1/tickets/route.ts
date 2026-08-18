import { apiError, apiList, authorise } from '@/backend/api/v1';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { SANDBOX_NOTE, SANDBOX_TICKETS } from '@/shared/api/sandbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/tickets` — tickets for the caller's own events.
 *
 * Attendee names and emails are personal data, so they need the `attendees:read` scope on
 * top of `tickets:read`. A key issued to a reporting dashboard can count tickets without
 * ever being able to export a mailing list, which is the distinction that makes handing
 * out a key safe.
 */
export async function GET(request: Request) {
  const auth = await authorise(request, 'tickets:read');
  if (!auth.ok) return auth.response;

  const withAttendees = auth.caller.scopes.includes('attendees:read');
  const query = new URL(request.url).searchParams;
  const eventId = query.get('event_id') ?? '';
  const limit = Math.min(500, Math.max(1, Number(query.get('limit') ?? 100)));

  const strip = (ticket: Record<string, unknown>) =>
    withAttendees
      ? ticket
      : { ...ticket, attendeeName: undefined, attendeeEmail: undefined };

  if (auth.caller.mode === 'test') {
    const data = SANDBOX_TICKETS.filter((t) => !eventId || t.eventId === eventId).map((t) =>
      strip({ ...t })
    );
    return apiList(auth.caller, data, { note: SANDBOX_NOTE });
  }

  if (!isAdminConfigured()) return apiList(auth.caller, []);

  try {
    let ref = getAdminDb()
      .collection('tickets')
      .where('organizerId', '==', auth.caller.organizerId);

    if (eventId) ref = ref.where('eventId', '==', eventId);

    const snap = await ref.limit(limit).get();

    return apiList(
      auth.caller,
      snap.docs.map((doc) => {
        const data = doc.data();
        return strip({
          id: doc.id,
          reference: data.reference,
          eventId: data.eventId,
          tierId: data.tierId,
          tierName: data.tierName,
          attendeeName: data.attendeeName,
          attendeeEmail: data.attendeeEmail,
          price: data.price,
          currency: data.currency,
          status: data.status,
          seat: data.seat ?? null,
          purchasedAt: data.purchasedAt,
        });
      })
    );
  } catch {
    return apiError(503, 'unavailable', 'Could not read tickets just now.');
  }
}
