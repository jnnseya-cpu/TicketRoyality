/**
 * Shared domain model. Imported by both the client bundle and the server layer,
 * so it must never pull in firebase-admin, node built-ins or DOM APIs.
 */

export type UserType = 'customer' | 'organiser' | 'superuser';
export type AccountStatus = 'pending' | 'approved' | 'suspended';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
}

export interface Wallet {
  balanceAcu: number;
  lifetimeGrantedAcu: number;
  lifetimePurchasedAcu: number;
  lifetimeSpentAcu: number;
  lastUpdatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  userType: UserType;
  status: AccountStatus;
  dateOfBirth?: string;
  phone?: string;
  address?: Address;
  createdAt: string;

  /** Organiser-only branding + company fields. */
  companyName?: string;
  website?: string;
  bio?: string;
  logoUrl?: string;
  coverUrl?: string;
  socials?: { facebook?: string; instagram?: string; twitter?: string };

  /** Commission overrides applied by the superuser (falls back to platform defaults). */
  commissionPercent?: number;
  adminFee?: number;

  wallet?: Wallet;
  welcomeBonusGranted?: boolean;

  /**
   * Marketing consent.
   *
   * Absent means "not yet asked", which `resolveChannels` treats as sendable — that is
   * the soft opt-in position for an existing customer under PECR, and it is why the
   * unsubscribe link in every marketing email is not decoration but the lawful basis
   * for sending the next one.
   *
   * Service email — tickets, refunds, security — never consults this. Those are
   * `mandatory` in the comms catalogue and are sent whatever it says, because a ticket
   * is a thing the customer paid for, not a message they can be marketed out of.
   */
  marketing?: {
    /** false = unsubscribed. Set by the one-click link, no login required. */
    email?: boolean;
    unsubscribedAt?: string;
  };
}

export type EventType = 'physical' | 'online' | 'livestream';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Speaker {
  name: string;
  title: string;
  photoUrl?: string;
}

/**
 * A physical area of the venue with its own door.
 *
 * Zones are about *where a ticket may go*, which is a different question from what it
 * cost. A £200 hospitality ticket and a £200 stage-side ticket are the same tier price
 * and belong in different rooms; general admission and VIP can share a main gate and
 * diverge at the lounge door.
 *
 * So a zone names the tiers it admits rather than deriving them from price, and a door
 * scanning for that zone refuses everything else — which is the "gates that admit only
 * the ticket types assigned to them" the platform has been claiming.
 */
export interface VenueZone {
  id: string;
  name: string;
  /** Tier ids this door admits. Empty means every tier — a main gate. */
  allowedTierIds: string[];
  /**
   * How many people the zone holds. `null` for uncapped, which is normal for a main
   * gate where the event capacity is the real limit.
   */
  capacity: number | null;
  /**
   * Whether someone may leave and come back. A smoking area or a main gate usually
   * allows it; a one-shot hospitality sitting usually does not.
   */
  reEntry: boolean;
  /** Currently inside. Maintained transactionally by the door, never edited by hand. */
  occupancy?: number;
}

/**
 * A hospitality package — a table sold as inventory, not a ticket with extras.
 *
 * The distinction matters. A VIP ticket is one seat at one price; a hospitality package
 * is *n* covers bought together by one buyer who then names the guests, usually with a
 * deposit now and the balance later. Modelling it as a fancy tier would mean either
 * charging per person for something bought per table, or inventing a second way to take
 * money — and a second money path is the one thing this codebase has consistently
 * refused to grow.
 *
 * So a package references a `tierId`: the tier is the inventory and the price, the
 * package is the table structure around it. Everything about charging, commission,
 * refunds and issuance stays exactly where it already is.
 */
export interface HospitalityPackage {
  id: string;
  name: string;
  /** The tier that carries price and inventory. One table consumes `covers` of it. */
  tierId: string;
  /** Seats at the table. */
  covers: number;
  /** What the buyer gets — "Champagne on arrival", "Three-course dinner". */
  inclusions: string[];
  /**
   * Percentage payable up front, 1–100. `100` means pay in full, which is the default
   * and the only mode that needs no chasing.
   */
  depositPercent: number;
  /** When the rest is due. Ignored when `depositPercent` is 100. */
  balanceDueDate?: string;
  /** The door this table is admitted through, if the venue has zones. */
  zoneId?: string;
}

/** A named seat at a booked table. */
export interface HospitalityGuest {
  name: string;
  email?: string;
  dietary?: string;
  accessibility?: string;
}

export type HospitalityBookingStatus =
  | 'deposit_pending'
  | 'deposit_paid'
  | 'paid'
  | 'cancelled'
  | 'expired';

/**
 * One booked table.
 *
 * **Tickets are not issued until the balance is settled.** A deposit reserves the table;
 * it does not admit anybody. Issuing on deposit would put guests in the room holding
 * tickets for money the organiser has not received, and chasing a balance from someone
 * already at their table is not a position to design into a product.
 */
export interface HospitalityBooking {
  id: string;
  eventId: string;
  packageId: string;
  tierId: string;
  buyerUserId: string;
  buyerEmail: string;
  covers: number;
  /** Integer minor units, from the pricing engine. Never recomputed for display. */
  totalMinor: number;
  depositMinor: number;
  paidMinor: number;
  status: HospitalityBookingStatus;
  guests: HospitalityGuest[];
  balanceDueDate?: string;
  createdAt: string;
  ticketIds?: string[];
}

export interface SeatingSection {
  id: string;
  name: string;
  color: string;
  price: number;
  startRow: string;
  rows: number;
  seatsPerRow: number;
}

export interface TicketTier {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sold?: number;
  /**
   * Reserved by a checkout in progress. Subtracted by `availableInTier()`, which has
   * always read this field — it simply had nowhere to come from until checkout holds
   * existed. Separate from `quantity` on purpose: `quantity` is the organiser's
   * statement of how many exist, and reserving a seat must not destroy that number.
   */
  held?: number;
}

export interface StreamDetails {
  streamUrl: string;
  streamKey?: string;
  chatEnabled: boolean;
}

export interface Recurrence {
  frequency: 'weekly' | 'monthly';
  endDate: string;
}

export interface PriceSuggestion {
  tierId: string;
  tierName: string;
  /** The price at the moment the review ran, so a stale suggestion is visible as stale. */
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
}

/**
 * AI dynamic selling, per event.
 *
 * `enabled` turns the review on; it does **not** authorise a price change. Suggestions
 * are applied by the organiser, one tier at a time. Automatic repricing was considered
 * and rejected for now: there are no checkout inventory holds yet, so a price that
 * moves on its own can move underneath somebody who is mid-purchase.
 */
export interface DynamicPricing {
  enabled: boolean;
  lastReviewedAt?: string;
  summary?: string;
  suggestions?: PriceSuggestion[];
}

export interface Event {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryGroup: string;
  imageUrl: string;
  date: string; // ISO 8601
  endDate?: string;

  eventType: EventType;
  location: string;
  country: string;
  coordinates?: Coordinates;
  onlineLink?: string;
  streamDetails?: StreamDetails;

  price: number;
  currency: string;
  ticketTiers: TicketTier[];
  seating?: SeatingSection[];
  /** Doors within the venue. Absent means one undifferentiated gate. */
  zones?: VenueZone[];
  /** Tables sold as inventory. Each references the tier that carries its price. */
  hospitality?: HospitalityPackage[];
  capacity?: number;

  organizerId: string;
  organizerName: string;
  organizerLogoUrl?: string;

  speakers?: Speaker[];
  recurrence?: Recurrence;
  dynamicPricing?: DynamicPricing;

  featured?: boolean;
  videoAdUrl?: string;
  status: 'draft' | 'published' | 'cancelled';
  createdAt: string;
}

export type TicketStatus = 'valid' | 'redeemed' | 'refunded' | 'cancelled';

export interface Ticket {
  id: string;
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
  /**
   * HMAC over the ticket id and event id, written at issuance by `functions/`. Absent on
   * tickets issued before signing existed, and when `QR_SIGNING_KEY` is unset.
   */
  qrSignature?: string;
  /**
   * Per-ticket HMAC seed for rotating codes. The wallet computes codes from it locally
   * so a ticket works without signal; `firestore.rules` already restricts ticket reads
   * to the owner, the event's organiser and administrators.
   */
  rotationSeed?: string;

  tierId?: string;
  tierName: string;
  seat?: string;
  price: number;
  currency: string;

  status: TicketStatus;
  redeemedAt?: string;
  purchasedAt: string;
  paymentProvider: 'stripe' | 'bitripay' | 'offline' | 'free';
}

export interface Coupon {
  id: string;
  code: string;
  organizerId: string;
  discountType: 'percentage' | 'fixed';
  amount: number;
  usageLimit: number;
  usageCount: number;
  expiresAt: string;
  scope: 'organiser' | 'marketplace';
}

export type OfflineProvider = 'vodacom' | 'airtel' | 'orange' | 'africell';

export interface OfflinePayment {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  eventId: string;
  eventTitle: string;
  provider: OfflineProvider;
  paymentNumber: string;
  baseAmount: number;
  serviceFee: number;
  totalAmount: number;
  currency: string;
  reference: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type LedgerType =
  | 'WELCOME_BONUS'
  | 'TOPUP_STRIPE'
  | 'ADMIN_GRANT'
  | 'AI_SPEND'
  | 'REVERSAL';

export interface LedgerEntry {
  id: string;
  uid: string;
  type: LedgerType;
  deltaAcu: number;
  balanceBeforeAcu: number;
  balanceAfterAcu: number;
  amountUsd?: number;
  providerCostUsd?: number;
  markupMultiplier?: number;
  userChargeUsd?: number;
  reason?: string;
  createdAt: string;
}

export interface CartItem {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  imageUrl: string;
  tierId: string;
  tierName: string;
  price: number;
  currency: string;
  quantity: number;
}
