import { randomInt } from 'node:crypto';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';

import type { EventDoc, PaymentEventDoc, TicketDoc } from './domain';

/**
 * Ticket issuance — the privileged operation at the centre of the platform.
 *
 * `firestore.rules` lets a signed-in user create a ticket only for themselves. That
 * rule is correct and must not be relaxed, which is exactly why issuance lives here:
 * the Admin SDK bypasses rules, and this is the only code that is allowed to.
 *
 * The whole design turns on one question — what happens when the same payment is
 * delivered twice? Stripe redelivers by design, KODA retries for 24 hours, and the
 * previous implementation held processed ids in a `Set` in memory, which loses its
 * contents on every deploy and is not shared between instances. Two instances, one
 * replay, two sets of tickets, one angry organiser over capacity.
 *
 * So idempotency is a document id here, enforced by the database:
 *   - the webhook writes `payment_events/{providerEventId}` — a replay cannot create a
 *     second document, so it cannot trigger a second issuance;
 *   - the transaction writes `issued_payments/{providerEventId}` alongside the tickets,
 *     so even a manual re-run cannot double-issue.
 */

/** Thrown for conditions a retry could plausibly fix. Anything else is terminal. */
export class TransientIssuanceError extends Error {}

/**
 * A condition no number of retries will fix. Carries the terminal status to record.
 *
 * The distinction matters more than it looks: a Cloud Function that throws on a
 * permanent failure retries until the backoff ceiling and then gives up silently,
 * which is the worst of both — wasted work and no alert. Terminal failures are written
 * down instead.
 */
export class PermanentIssuanceError extends Error {
  constructor(
    message: string,
    readonly status: 'oversold' | 'failed'
  ) {
    super(message);
  }
}

/**
 * Ticket reference: human-readable, unambiguous, and not guessable.
 *
 * `crypto.randomInt` rather than `Math.random` — a reference is quoted over the phone
 * and searched at the door, and a predictable sequence lets someone probe for
 * references that are not theirs. The alphabet drops I, O, 0 and 1 because these are
 * read aloud by people in a loud room.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReference(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `TR-${block()}-${block()}`;
}

export function buildTickets(payment: PaymentEventDoc, event: EventDoc, tierName: string): TicketDoc[] {
  const purchasedAt = new Date().toISOString();

  return Array.from({ length: payment.quantity }, (_, index) => {
    const ticket: TicketDoc = {
      reference: generateReference(),
      eventId: payment.eventId,
      // Event details are frozen onto the ticket. It must render correctly at the gate
      // when the event document is unreachable, and stay a truthful record afterwards
      // even if the event is later edited or deleted.
      eventTitle: event.title,
      eventDate: event.date,
      eventLocation: event.location,
      organizerId: event.organizerId,
      organizerName: event.organizerName,
      userId: payment.userId,
      attendeeName: payment.attendeeName,
      attendeeEmail: payment.attendeeEmail,
      tierId: payment.tierId,
      tierName,
      price: payment.price,
      currency: payment.currency,
      status: 'valid',
      purchasedAt,
      paymentProvider: payment.provider,
    };

    // Firestore rejects `undefined`, and an absent seat is genuinely absent rather
    // than empty — a general-admission ticket has no seat, it does not have seat ''.
    const seat = payment.seats?.[index];
    if (seat) ticket.seat = seat;

    return ticket;
  });
}

export interface IssueOutcome {
  duplicate: boolean;
  ticketIds: string[];
}

/**
 * Issues tickets and consumes inventory in a single transaction.
 *
 * Every read happens before every write, which Firestore requires. The order below is
 * therefore load-bearing, not stylistic.
 */
export async function issueTickets(
  db: Firestore,
  providerEventId: string,
  payment: PaymentEventDoc
): Promise<IssueOutcome> {
  const markerRef = db.collection('issued_payments').doc(providerEventId);
  const eventRef = db.collection('events').doc(payment.eventId);

  return db.runTransaction(async (tx: Transaction) => {
    const [marker, eventSnap] = await Promise.all([tx.get(markerRef), tx.get(eventRef)]);

    if (marker.exists) {
      const existing = marker.data() as { ticketIds?: string[] } | undefined;
      return { duplicate: true, ticketIds: existing?.ticketIds ?? [] };
    }

    if (!eventSnap.exists) {
      // Terminal. The payment is real but the event it refers to is gone, so this
      // needs a refund and a person, not another attempt.
      throw new PermanentIssuanceError(`Event ${payment.eventId} does not exist`, 'failed');
    }

    const event = eventSnap.data() as EventDoc;
    const tiers = Array.isArray(event.ticketTiers) ? event.ticketTiers : [];
    const tierIndex = tiers.findIndex((t) => t.id === payment.tierId);

    if (tierIndex === -1) {
      throw new PermanentIssuanceError(
        `Tier ${payment.tierId} not found on event ${payment.eventId}`,
        'failed'
      );
    }

    const tier = tiers[tierIndex];
    const sold = tier.sold ?? 0;

    // The capacity check and the increment are inside the same transaction, which is
    // what makes overselling impossible rather than unlikely. Firestore aborts and
    // replays the whole callback if the event document changed underneath, so two
    // concurrent buyers cannot both read `sold` and both pass this line.
    if (sold + payment.quantity > tier.quantity) {
      throw new PermanentIssuanceError(
        `Tier ${tier.name} has ${tier.quantity - sold} left, payment is for ${payment.quantity}`,
        'oversold'
      );
    }

    const tickets = buildTickets(payment, event, tier.name);
    const ticketIds: string[] = [];

    for (const ticket of tickets) {
      const ref = db.collection('tickets').doc();
      tx.set(ref, ticket);
      ticketIds.push(ref.id);
    }

    const nextTiers = [...tiers];
    nextTiers[tierIndex] = { ...tier, sold: sold + payment.quantity };
    tx.update(eventRef, { ticketTiers: nextTiers });

    tx.set(markerRef, {
      providerEventId,
      provider: payment.provider,
      eventId: payment.eventId,
      tierId: payment.tierId,
      userId: payment.userId,
      quantity: payment.quantity,
      ticketIds,
      issuedAt: new Date().toISOString(),
    });

    return { duplicate: false, ticketIds };
  });
}

/**
 * Reverses an issuance: marks the tickets refunded and returns inventory to the tier.
 *
 * Tickets are marked rather than deleted. A deleted ticket cannot be presented at the
 * door — but it also cannot be *explained* at the door, and "there is no record of your
 * purchase" is exactly what a refunded customer arriving by mistake must not be told.
 */
export async function refundTickets(
  db: Firestore,
  providerEventId: string,
  reason: string
): Promise<{ refunded: number }> {
  const markerRef = db.collection('issued_payments').doc(providerEventId);

  return db.runTransaction(async (tx: Transaction) => {
    const marker = await tx.get(markerRef);
    if (!marker.exists) return { refunded: 0 };

    const data = marker.data() as {
      ticketIds?: string[];
      eventId?: string;
      tierId?: string;
      refundedAt?: string;
    };

    if (data.refundedAt) return { refunded: 0 };

    const ticketIds = data.ticketIds ?? [];
    const ticketRefs = ticketIds.map((id) => db.collection('tickets').doc(id));

    const [ticketSnaps, eventSnap] = await Promise.all([
      ticketIds.length > 0 ? tx.getAll(...ticketRefs) : Promise.resolve([]),
      data.eventId
        ? tx.get(db.collection('events').doc(data.eventId))
        : Promise.resolve(null),
    ]);

    // A redeemed ticket is not refunded here. Someone attended on it; reversing that
    // silently would corrupt the door numbers and the organiser's settlement. It needs
    // a human decision, so it is left alone and reported.
    let reversible = 0;
    for (const snap of ticketSnaps) {
      if (!snap.exists) continue;
      const status = (snap.data() as { status?: string }).status;
      if (status !== 'valid') continue;
      tx.update(snap.ref, { status: 'refunded', refundedAt: new Date().toISOString() });
      reversible += 1;
    }

    if (eventSnap?.exists && data.tierId && reversible > 0) {
      const event = eventSnap.data() as EventDoc;
      const tiers = Array.isArray(event.ticketTiers) ? event.ticketTiers : [];
      const index = tiers.findIndex((t) => t.id === data.tierId);

      if (index !== -1) {
        const next = [...tiers];
        // Clamped at zero. If the counter is already wrong, a refund must not make it
        // negative and start handing out inventory that does not exist.
        next[index] = { ...next[index], sold: Math.max(0, (next[index].sold ?? 0) - reversible) };
        tx.update(eventSnap.ref, { ticketTiers: next });
      }
    }

    tx.update(markerRef, { refundedAt: new Date().toISOString(), refundReason: reason });

    return { refunded: reversible };
  });
}

let cached: Firestore | undefined;

export function db(): Firestore {
  if (!cached) cached = getFirestore();
  return cached;
}
