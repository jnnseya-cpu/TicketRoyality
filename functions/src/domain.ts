/**
 * The document shapes this codebase reads and writes.
 *
 * Deliberately declared here rather than imported from `src/shared/types`. `firebase
 * deploy` uploads only the `functions/` directory, so anything this package needs at
 * build time must live inside it — a build that reaches two levels up works on a
 * developer's machine and is a different, worse kind of broken in CI.
 *
 * The duplication is guarded, not tolerated: `src/backend/services/issuance-contract.ts`
 * asserts these types are assignable to the application's own, and the root
 * `npm run typecheck` fails if they drift apart.
 */

export type TicketStatus = 'valid' | 'redeemed' | 'refunded' | 'cancelled';
export type PaymentProvider = 'stripe' | 'bitripay' | 'offline' | 'free';

export interface TicketDoc {
  reference: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  organizerId: string;
  organizerName: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  tierId?: string;
  tierName: string;
  /** Who this admits — "Child", "Student". Absent on single-price tiers. */
  attendeeType?: string;
  seat?: string;
  price: number;
  currency: string;
  status: TicketStatus;
  redeemedAt?: string;
  purchasedAt: string;
  paymentProvider: PaymentProvider;
  /**
   * HMAC over the ticket id and event id, written at issuance. Absent when
   * `QR_SIGNING_KEY` is unset — a missing key must not stop a paid-for ticket being
   * issued, and the door route records the difference rather than failing silently.
   */
  qrSignature?: string;
  /**
   * Per-ticket HMAC seed for rotating codes. Readable by the ticket's owner — which is
   * the point, since the wallet computes codes offline from it — and by nobody else.
   */
  rotationSeed?: string;
}

export interface TicketTierDoc {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sold?: number;
  /** Reserved by a checkout in progress. Consumed by issuance, not merely ignored. */
  held?: number;
}

export interface EventDoc {
  title: string;
  date: string;
  location: string;
  organizerId: string;
  organizerName: string;
  ticketTiers: TicketTierDoc[];
  status?: string;
}

/**
 * Terminal states carry a reason and are never retried; `pending` and `processing` are
 * the only states the trigger will pick up again.
 *
 * `oversold` exists because it is a real outcome, not a theoretical one: a payment can
 * confirm after the last ticket in its tier has gone. Money has moved and no ticket can
 * legally be issued, so it needs a state of its own rather than being folded into
 * `failed` — the resolution is a refund, and somebody has to be told.
 */
export type PaymentEventStatus =
  | 'pending'
  | 'processing'
  | 'issued'
  | 'refunded'
  | 'oversold'
  | 'failed'
  | 'ignored';

/**
 * The webhook's record of a provider event.
 *
 * The document id is the provider's own event id, which is what makes issuance
 * idempotent: a replayed webhook cannot create a second document, so it cannot trigger
 * a second issuance, no matter how many instances are running.
 */
export interface PaymentEventDoc {
  provider: PaymentProvider;
  /** The provider's event type, kept verbatim for debugging. */
  providerType: string;
  intent: 'issue' | 'refund' | 'ignore';
  status: PaymentEventStatus;

  eventId: string;
  tierId: string;
  userId: string;
  quantity: number;
  /** Unit price in major currency units. */
  price: number;
  currency: string;
  attendeeName: string;
  attendeeEmail: string;
  seats?: string[];
  /**
   * Attendee-type breakdown when one payment mixes prices — Adult ×2 + Child ×1 in a
   * single order (docs/23 §26). Flattened in declaration order onto tickets, the same
   * order `seats` uses, so the i-th entry names who sits in the i-th seat. When absent
   * every ticket is `price` at `quantity`, which is every payment recorded before mixes
   * existed. The sum of these quantities always equals `quantity`; issuance refuses the
   * payment when it does not, because a mismatch means the two halves of the order came
   * from different requests.
   */
  mix?: Array<{ typeId: string; typeName: string; price: number; quantity: number }>;

  /**
   * The provider identifier shared between a payment and its later refund — Stripe's
   * payment intent id. Recorded on issuance so a refund can find what to reverse.
   */
  providerRef?: string;
  /** On a refund event: the `providerRef` of the payment being reversed. */
  refundsRef?: string;

  receivedAt: string;
  processedAt?: string;
  /** Set on every terminal state that is not `issued`. */
  reason?: string;
  attempts?: number;
  ticketIds?: string[];
  /** The checkout hold this payment consumes, if one was placed. */
  holdId?: string;
  /**
   * The fee quote this order was made under (§16), persisted by the webhook so
   * accounting never recomputes history from a later config — and so the ticket
   * email can show the all-in total the buyer actually paid, not just face value.
   * Absent on refunds and on payments recorded before the field existed.
   */
  feeSnapshot?: {
    pricingVersion: number;
    feeConfigVersion: string;
    faceMinor: number;
    serviceFeeMinor: number;
    buyerTotalMinor: number;
    organiserPayoutMinor?: number;
  };
}

/** Mirrors `VenueZone` in `src/shared/types`. See `qr-contract.ts` on why it is restated. */
export interface VenueZoneDoc {
  id: string;
  name: string;
  allowedTierIds: string[];
  capacity: number | null;
  reEntry: boolean;
  occupancy?: number;
}
