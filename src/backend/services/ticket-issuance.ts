import 'server-only';

import type { Ticket } from '@/shared/types';
import { generateTicketReference } from '@/shared/utils';

/**
 * Ticket issuance — the privileged operation at the centre of the platform.
 *
 * Issuance is triggered by a *confirmed payment*, never by a browser redirect. A user
 * who closes the tab the moment their card is charged must still receive their ticket,
 * so the webhook is the only authority.
 *
 * Writing a ticket for another user is deliberately forbidden by `firestore.rules`
 * (a client may only create a ticket where `userId == request.auth.uid`). That rule is
 * correct and must not be relaxed — which is exactly why this service needs the Admin
 * SDK, whose writes bypass rules.
 */

export interface IssueRequest {
  /** Idempotency key — the payment provider's event id. Replays must not double-issue. */
  providerEventId: string;
  eventId: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  tierId: string;
  tierName: string;
  quantity: number;
  price: number;
  currency: string;
  paymentProvider: Ticket['paymentProvider'];
  seats?: string[];
}

export interface IssueResult {
  issued: Ticket[];
  duplicate: boolean;
}

/**
 * Builds the ticket documents for a confirmed payment.
 *
 * Split out from persistence so the shape is unit-testable without a database, and so
 * the Admin SDK wiring below is the only part that needs credentials.
 */
export function buildTickets(
  request: IssueRequest,
  event: { title: string; date: string; location: string; organizerId: string; organizerName: string }
): Array<Omit<Ticket, 'id'>> {
  const purchasedAt = new Date().toISOString();

  return Array.from({ length: request.quantity }, (_, index) => ({
    reference: generateTicketReference(),
    eventId: request.eventId,
    // Event details are frozen onto the ticket: it must still render correctly at the
    // gate if the event document is unavailable, and remain a valid record afterwards.
    eventTitle: event.title,
    eventDate: event.date,
    eventLocation: event.location,
    organizerId: event.organizerId,
    organizerName: event.organizerName,
    userId: request.userId,
    attendeeName: request.attendeeName,
    attendeeEmail: request.attendeeEmail,
    tierId: request.tierId,
    tierName: request.tierName,
    seat: request.seats?.[index],
    price: request.price,
    currency: request.currency,
    status: 'valid' as const,
    purchasedAt,
    paymentProvider: request.paymentProvider,
  }));
}

/**
 * Persists tickets and decrements inventory in one transaction.
 *
 * NOT YET WIRED. Requires `firebase-admin` with a service account:
 *
 *   1. Look up `issued_payments/{providerEventId}` — if present, return `duplicate: true`
 *      and issue nothing. Stripe delivers webhooks more than once by design.
 *   2. In a transaction: convert the checkout hold to a sale on the tier counter
 *      (`held -= n`, `sold += n`), write the ticket documents, and write the
 *      `issued_payments` marker.
 *   3. Emit `ticket.issued` to Pub/Sub so notifications and analytics pick it up.
 *
 * Until this lands, tickets are created client-side after checkout, which loses the
 * ticket if the user closes the tab. That is tracked as debt D1 in
 * docs/13-roadmap-and-production-readiness.md and is the highest-priority Phase 2 item.
 */
export async function issueTickets(_request: IssueRequest): Promise<IssueResult> {
  throw new Error(
    'issueTickets requires the Firebase Admin SDK. See docs/13 debt item D1 for the ' +
      'implementation plan; until then the client-side path in TicketBox is used.'
  );
}
