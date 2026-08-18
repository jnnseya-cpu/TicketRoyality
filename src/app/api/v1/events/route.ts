import { apiList, authorise } from '@/backend/api/v1';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { SANDBOX_EVENTS, SANDBOX_NOTE } from '@/shared/api/sandbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/events` — the caller's own events.
 *
 * Scoped to the key's organiser in the query itself, not filtered afterwards: a filter
 * applied after a read is one refactor away from being dropped, and the failure mode is
 * one customer reading another's event list.
 */
export async function GET(request: Request) {
  const auth = await authorise(request, 'events:read');
  if (!auth.ok) return auth.response;

  if (auth.caller.mode === 'test') {
    return apiList(auth.caller, [...SANDBOX_EVENTS], { note: SANDBOX_NOTE });
  }

  if (!isAdminConfigured()) return apiList(auth.caller, []);

  const snap = await getAdminDb()
    .collection('events')
    .where('organizerId', '==', auth.caller.organizerId)
    .limit(200)
    .get();

  return apiList(
    auth.caller,
    snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        status: data.status,
        date: data.date,
        location: data.location,
        currency: data.currency,
        // Only the fields an integrator needs. The raw document carries internal
        // bookkeeping — held counts, access-code state — that is nobody else's business.
        ticketTiers: (data.ticketTiers ?? []).map((tier: Record<string, unknown>) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          quantity: tier.quantity,
          sold: tier.sold ?? 0,
        })),
      };
    })
  );
}
