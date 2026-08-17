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
