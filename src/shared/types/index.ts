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

  /**
   * Stripe Connect. When set, the organiser has an Express account money can be settled to.
   * `stripeConnectPayoutsEnabled` mirrors Stripe's `payouts_enabled` — the settlement layer
   * reads it before paying and never assumes it. Absent until the organiser onboards; the
   * whole feature is gated by `STRIPE_CONNECT_ENABLED` server-side regardless.
   */
  stripeConnectId?: string;
  stripeConnectPayoutsEnabled?: boolean;

  /**
   * White-label tier. Absent (or `enabled: false`) means this organiser sells under the
   * standard TicketRoyality model — 0% commission, the platform's own buyer service fee,
   * platform branding.
   *
   * When enabled, the organiser sells under their own brand and sets their own fan-facing
   * booking fee (their revenue, may be zero), and the platform earns a flat per-ticket fee
   * instead. See `computeWhiteLabelOrder` in `shared/fees.ts` for the authoritative
   * arithmetic; the fields here are the inputs, never the computed prices. `platformPerTicketMinor`
   * is set by the superuser (it is TicketRoyality's revenue); the fan-fee fields are the
   * organiser's own.
   */
  whiteLabel?: WhiteLabelConfig;

  wallet?: Wallet;
  welcomeBonusGranted?: boolean;

  /**
   * Set by `/api/account/welcome` before it sends, and cleared again if the send fails.
   * Its presence is what stops a double-submit or a resumed registration from sending
   * the welcome email twice.
   */
  welcomeEmailSentAt?: string;

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

/**
 * A white-label organiser's configuration. See `UserProfile.whiteLabel` and the
 * authoritative arithmetic in `computeWhiteLabelOrder` (`shared/fees.ts`). The fields here
 * are inputs, never computed prices. `platformPerTicketMinor` is superuser-set (platform
 * revenue); the fan-fee fields are the organiser's own.
 */
export interface WhiteLabelConfig {
  enabled: boolean;
  /** The name shown to fans in place of "TicketRoyality" on this organiser's pages and receipts. */
  brandName?: string;
  /** Reserved for the custom-domain phase — the organiser's own host, e.g. `tickets.brand.com`. */
  customDomain?: string;
  /** The organiser's own booking fee, as a percentage of face. Zero is allowed. */
  buyerFeePct: number;
  /** The organiser's own booking fee, flat per paid ticket, in minor units. Zero is allowed. */
  buyerFeeFixedMinor: number;
  /** `pass` charges the fan the booking fee on top of face; `absorb` funds it from the organiser's payout. */
  feeMode: 'absorb' | 'pass';
  /** TicketRoyality's flat cut per issued paid ticket, in minor units. Superuser-set — this is platform revenue. */
  platformPerTicketMinor: number;
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

/**
 * One session inside an event — a talk, a workshop, a breakout.
 *
 * ## Why this is not a zone and not a separate event
 *
 * A zone is a door: it asks whether a ticket may be in a room *now*. A session is a
 * booking: it asks whether somebody has a place in a workshop *on Thursday at 2pm*,
 * usually decided weeks earlier, because the workshop holds thirty and the conference
 * sold nine hundred.
 *
 * Running sessions as separate events would give each one its own checkout, its own
 * ticket and its own reconciliation, and an attendee would buy a conference pass and then
 * "buy" six free tickets. So a session is inventory *inside* the event, registered
 * against a ticket that already exists.
 *
 * `capacity: null` is the common case — a keynote everybody attends, listed so it appears
 * on the agenda, with nothing to reserve.
 */
export interface EventSession {
  id: string;
  title: string;
  description?: string;
  /** ISO 8601. The agenda is built by sorting on these, so they are not optional. */
  start: string;
  end: string;
  /** Parallel streams, for an agenda with more than one thing happening at once. */
  track?: string;
  /** The room, which is not the venue — "Workshop 2", "Main Hall". */
  location?: string;
  speakerNames?: string[];
  /** `null` means no limit: on the agenda, nothing to reserve. */
  capacity: number | null;
  /** Tier ids that may register. Empty means every ticket holder. */
  allowedTierIds: string[];
  /** Places taken. Maintained transactionally, never edited by hand. */
  registered?: number;
}

export interface SeatingSection {
  id: string;
  name: string;
  color: string;
  price: number;
  startRow: string;
  rows: number;
  seatsPerRow: number;
  /**
   * The tier whose inventory these seats consume.
   *
   * Without it a section is decoration: a picture of a room next to a tier that counts
   * separately. With it, choosing seat F12 holds one place in that tier, so the seat map
   * and the ticket count are the same number rather than two numbers that agree until
   * they do not.
   *
   * Absent on sections created before seat selection existed; those stay display-only.
   */
  tierId?: string;
  /**
   * The room, when the room is not a rectangle.
   *
   * `rows × seatsPerRow` is a spreadsheet. A stalls curves outwards so the back rows are
   * longer, a gangway splits row F, a pillar removes D7, and a cabaret room is rows of six
   * around tables. When this is present it is the authority and `rows`/`seatsPerRow` are
   * ignored for layout; when it is absent the rectangle is generated exactly as before, so
   * every section built before this existed is untouched.
   *
   * Shaped by `SeatRowSpec` in `shared/seating.ts`, which is also where adjacency lives.
   */
  rowSpec?: {
    name: string;
    seats: number;
    from?: number;
    missing?: number[];
    aisleAfter?: number[];
    offset?: number;
  }[];
  /** Seats sold but not admitted — obstructed view, a pillar, a camera position. */
  unavailableSeats?: string[];
  /** Seats held back for wheelchair users and companions, never sold online. */
  accessibleSeats?: string[];
  /**
   * How the rows lie in the room — docs/23 §5, phase 1 of the seat-map engine.
   *
   * Geometry only: a seat's identity stays its label, so nothing about holds, locks,
   * checkout or issuance changes when a section changes shape. Absent means straight,
   * which is every section built before shapes existed.
   */
  shape?: 'straight' | 'curve' | 'arc' | 'angled' | 'vertical';
  /**
   * The sweep of a curve/arc section in degrees (10–180). Defaults: curve 40, arc 90.
   * Ignored for the other shapes.
   */
  curveDegrees?: number;
  /**
   * docs/23 §10 — refuse selections that strand a single empty seat, at hold time.
   * Off by default; best-available always *prefers* tidy selections either way.
   */
  preventOrphans?: boolean;
  /**
   * Free-form seat positions from the floor-plan canvas — a map of **seat label → {x, y}**
   * in the same venue-space units the auto-layout uses. Pure geometry, exactly like `shape`:
   * a seat's identity stays its label, so holds, checkout, issuance and the door are
   * untouched whether a seat was auto-placed or dragged. When a label appears here it is the
   * authority for *where* that seat sits; a label absent from it falls back to the computed
   * layout, so a half-arranged room still draws. Absent means every seat uses the auto-layout,
   * which is every section built before the canvas existed.
   */
  seatCoords?: Record<string, { x: number; y: number }>;
}

/**
 * Who is using a seat — docs/23 §2. Adult, Child, Student, Senior, Member.
 *
 * The *tier* stays the inventory and the seat category: one pool, one sales window, one
 * section of the room. An attendee type is a different price for the same place,
 * depending on who occupies it. That split is the spec's "Seat ≠ Ticket Type ≠ Price":
 * the section says where, the tier says which pool, the attendee type says who and at
 * what price — so an adult at £10 and their child at £5 sit side by side in one order,
 * both consuming the same tier's capacity.
 */
export interface AttendeeType {
  id: string;
  /** "Adult", "Child", "Student". Printed on the ticket and read at the door. */
  name: string;
  /** Major units, same currency as the event. The authoritative price for this type. */
  price: number;
  /**
   * docs/25 §20 — this type may not attend alone. A Child needing an Adult is the
   * canonical case: an order of four Child tickets and no Adult is refused at checkout,
   * server-side, because the organiser said children do not sit unaccompanied.
   */
  needsCompanion?: boolean;
  /**
   * Which types count as the companion. Empty/absent means any type that does not
   * itself need one — an Adult can chaperone, another Child cannot.
   */
  companionTypeIds?: string[];
  /**
   * How many of this type one companion may bring. Absent means no ratio — one adult
   * with any number of children — which is many organisers' real policy.
   */
  maxPerCompanion?: number;
}

export interface TicketTier {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sold?: number;
  /**
   * How the price is decided.
   *
   * `fixed` is every ordinary ticket: the organiser names the price and that is what is
   * charged. `choose` is pay-what-you-want — the buyer names it, bounded below by
   * `minPrice`. A congregation, a wedding list and a fundraiser all need the second one,
   * and forcing a donation into a priced tier makes the giver choose between the amount
   * they meant and the amount on the button.
   *
   * Absent means `fixed`, so every tier that already exists is unchanged.
   */
  pricing?: 'fixed' | 'choose';
  /**
   * Prices by who is attending — docs/23 §7. Absent means the tier has exactly one
   * price, `price`, which is every tier that existed before attendee types did. When
   * present, `price` remains the headline (usually the adult rate) and each entry is
   * priced server-side at checkout; all entries consume this tier's `quantity`.
   */
  attendeeTypes?: AttendeeType[];
  /** The floor for a `choose` tier. `0` genuinely allows nothing, which is a valid choice. */
  minPrice?: number;
  /** What the page suggests before the buyer types. Never enforced. */
  suggestedPrice?: number;
  /**
   * Whether the tier appears without an access code.
   *
   * `hidden` keeps it off the event page until somebody redeems the code, and — the part
   * that matters — checkout **refuses to sell it** without the code, server-side. The
   * code itself is never on the event document: published events are readable by anyone,
   * so a short memorable code hashed into public data is an offline dictionary attack.
   * Codes live in `event_access_codes`, which no client can read.
   *
   * What a stranger reading the raw document can still see is that a hidden tier exists,
   * and its price, because the tier stays in `ticketTiers` where inventory, holds and
   * issuance all read it. The code gates the purchase, not the knowledge.
   */
  visibility?: 'public' | 'hidden';
  /**
   * When this tier is buyable. Both ISO 8601, both optional.
   *
   * This is what a presale actually is: early tiers open first and close when the general
   * sale starts. Enforced server-side at checkout, because a tier that is merely greyed
   * out in the browser is on sale to anyone who can post a form.
   */
  salesStart?: string;
  salesEnd?: string;
  /**
   * The loyalty tier required to buy this.
   *
   * A members' presale that is only a secret link is a presale that leaks in one
   * screenshot. This is checked server-side at checkout against attendance the buyer
   * actually has, so the early window belongs to the people who earned it.
   */
  minLoyaltyTier?: LoyaltyTier;
  /**
   * Reserved by a checkout in progress. Subtracted by `availableInTier()`, which has
   * always read this field — it simply had nowhere to come from until checkout holds
   * existed. Separate from `quantity` on purpose: `quantity` is the organiser's
   * statement of how many exist, and reserving a seat must not destroy that number.
   */
  held?: number;
}

/**
 * A livestream attached to an event.
 *
 * ## What is gated, and what honestly cannot be
 *
 * `streamUrl` is an embed the organiser supplies — an unlisted YouTube or Vimeo link,
 * usually. It **never reaches a browser that does not hold a valid ticket**: the watch
 * page asks the server, the server checks for a ticket, and only then is the URL in the
 * response at all. Putting it in the page and hiding the player would be theatre; anyone
 * can read a page source.
 *
 * What that does *not* do is stop a ticket holder pasting the link into a group chat.
 * Preventing that needs signed, short-lived playback URLs from a streaming provider, and
 * a streaming provider is a sixth vendor. Until that decision is taken, the honest
 * position — stated here, on the organiser's form and on the watch page — is that access
 * is gated at the door, not at the pixel.
 *
 * `streamKey` is the organiser's own broadcast credential and is **never** returned to
 * any client, including the organiser's own browser after it is set.
 */
export interface StreamDetails {
  streamUrl: string;
  streamKey?: string;
  chatEnabled: boolean;
  /** Watchable after the event, for holders. Absent means the stream ends with the event. */
  replayUrl?: string;
  /** When the replay stops being available. Absent means indefinitely. */
  replayUntil?: string;
  /** Minutes before the start that the player opens. Doors, for a stream. */
  openMinutesBefore?: number;
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
  /**
   * The event page's banner, distinct from `imageUrl` (cards, tickets, previews).
   * A square-ish card image stretched across a hero always crops badly; absent means
   * the hero falls back to `imageUrl`, which is every event created before this.
   */
  coverImageUrl?: string;
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
  /**
   * Held ticket release. When set to a future date, a buyer still purchases now and their
   * ticket is issued, counted and guaranteed — but it shows as a **purchase confirmation**
   * rather than a scannable QR until this moment, and the door refuses it before then. The
   * organiser sets it, and the form caps it at **7 days before the event** so a held ticket
   * always releases with time to spare. Absent means tickets are usable the instant they
   * are bought, as before.
   */
  ticketReleaseAt?: string;
  /**
   * Fundraising alongside the tickets.
   *
   * Off unless the organiser turns it on. A donation is a **separate amount** from the
   * ticket price, carries no platform fee, and is the only part Gift Aid can ever be
   * claimed on — a ticket is a payment for admission, and claiming on one is the mistake
   * that costs a charity the whole claim back with interest.
   */
  giving?: {
    enabled: boolean;
    /** Shown beside the ask. A donor is entitled to know who they are giving to. */
    charityNumber?: string;
    /** "£25 buys a week of meals" — what the money does, in the organiser's words. */
    appeal?: string;
    /** Offered as buttons, in major units. The donor can always type their own. */
    suggested?: number[];
  };
  /** Doors within the venue. Absent means one undifferentiated gate. */
  zones?: VenueZone[];
  /** Tables sold as inventory. Each references the tier that carries its price. */
  hospitality?: HospitalityPackage[];
  capacity?: number;

  organizerId: string;
  organizerName: string;
  organizerLogoUrl?: string;

  speakers?: Speaker[];
  /** The agenda. Sessions are inventory inside the event, not separate events. */
  sessions?: EventSession[];
  sponsors?: Sponsor[];
  recurrence?: Recurrence;
  dynamicPricing?: DynamicPricing;

  /**
   * Who can find the event. 'public' (and absent, which is every event created before
   * this existed) appears in browse, search, the homepage and the sitemap. 'unlisted'
   * is reachable only by its link: still published, still buyable, never listed.
   * Enforced at the single query every public surface uses — getEvents() — so a new
   * surface built on it inherits the rule instead of re-remembering it.
   */
  listing?: 'public' | 'unlisted';
  /**
   * Stadiums' sellout upgrade, opt-in. When a tier sells out mid-checkout, the buyer is
   * moved to the cheapest strictly-dearer public tier with room — at the price they
   * chose, with the line naming the upgrade. The organiser gives away the difference to
   * avoid refusing a sale; absent means off, which is every event that predates it.
   */
  autoUpgradeOnSellout?: boolean;
  featured?: boolean;
  /** When a PAID featured placement lapses (ISO). Absent on manual grants, which the
      expiry cron therefore never touches. */
  featuredUntil?: string;
  /** The paid spotlight-strip placement (docs/04 M24), self-serve since 19 Aug 2026. */
  spotlight?: boolean;
  spotlightUntil?: string;
  /**
   * The premium "showcase" placement — the moving picture+video screen in the homepage's
   * Operational core panel, priced 30% above the spotlight. Same lifecycle as `spotlight`.
   */
  showcase?: boolean;
  showcaseUntil?: string;
  /** Queued for the weekly newsletter's dedicated block; cleared after one full send. */
  newsletterSpotlight?: boolean;
  /**
   * The organiser asked for homepage placement. `featured` itself is granted by a
   * superuser (and billed); the form can only ever set this flag. The two are separate
   * fields precisely so the security rules can allow one and refuse the other.
   */
  featuredRequested?: boolean;
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
  /** Who this admits — "Child", "Student". Absent on single-price tiers. docs/23 §26. */
  attendeeType?: string;
  seat?: string;
  price: number;
  currency: string;

  status: TicketStatus;
  redeemedAt?: string;
  purchasedAt: string;
  paymentProvider: 'stripe' | 'bitripay' | 'offline' | 'free';
}

/**
 * A tracked link.
 *
 * Affiliate, influencer, promoter and sponsor are the same object with different
 * intentions, and building four of them would mean four click counters, four commission
 * calculations and four places for the numbers to disagree. What actually differs is the
 * `kind` — which changes only how it is labelled and what the organiser expects of it —
 * plus whether there is an allocation and whether commission is owed.
 */
export type PartnerKind = 'affiliate' | 'influencer' | 'promoter' | 'sponsor' | 'referral';

export interface PartnerLink {
  /** Upper-cased, and the document id, so two partners cannot hold one code. */
  code: string;
  kind: PartnerKind;
  /** Who the link belongs to. An email, because most partners have no account here. */
  partnerName: string;
  partnerEmail: string;
  /** The organiser whose events it earns on. Never platform-wide. */
  organizerId: string;
  /** Scoped to one event, or absent for everything that organiser runs. */
  eventId?: string;
  /**
   * Percentage of **face value** owed to the partner. Comes out of the organiser's
   * payout, because the platform's own commission is zero — there is nothing else for it
   * to come out of, and pretending otherwise would misstate what an organiser receives.
   */
  commissionPercent: number;
  /**
   * Tickets this partner may sell before the link stops attributing. A promoter's
   * allocation, in the only form that means anything without moving inventory around:
   * past it, sales still complete and simply stop earning.
   */
  allocation?: number;
  active: boolean;
  createdAt: string;
  /** Maintained transactionally. Never recomputed for display. */
  clicks: number;
  sales: number;
  ticketsSold: number;
  grossMinor: number;
  commissionMinor: number;
  /**
   * The promoter's Stripe Connect account, once they onboard, so their owed commission can
   * be settled to them automatically instead of the organiser paying them by hand. Absent
   * until they onboard; without it the commission stays recorded-as-owed exactly as before.
   */
  connectedAccountId?: string;
}

/**
 * A settlement paid out to a party through Stripe Connect. Written once, idempotently, by
 * the settlement layer. Its **document id is the idempotency key**, so a repeated settlement
 * finds the record present and pays nothing again — the same guard `payment_events` uses on
 * the way in, applied on the way out.
 */
export interface Payout {
  /** = the idempotency key. */
  id: string;
  party: 'organiser' | 'promoter';
  /** The organiser's uid, or the promoter link's code. */
  partyId: string;
  connectedAccountId: string;
  amountMinor: number;
  currency: string;
  /** Why: e.g. `organiser_event`, `promoter_commission`, `box_office_owed`, `white_label`. */
  reason: string;
  /** `paid` moved money; `blocked` never attempted (Connect off, or payouts not enabled); `failed` tried and errored. */
  status: 'paid' | 'blocked' | 'failed';
  transferId?: string;
  error?: string;
  createdAt: string;
}

/** One attributed order. Written once, by the payment path, and never edited. */
export interface Attribution {
  id: string;
  code: string;
  organizerId: string;
  eventId: string;
  quantity: number;
  faceMinor: number;
  commissionMinor: number;
  commissionPercent: number;
  providerRef?: string;
  createdAt: string;
}

/** A sponsor on an event page. Reporting is aggregate; see `docs/04` M19. */
export interface Sponsor {
  name: string;
  logoUrl: string;
  url?: string;
  /** Their tracked link, so reach is measured rather than asserted. */
  code?: string;
}

/**
 * A season pass: one purchase covering a run of events.
 *
 * ## Why it issues a ticket per event rather than admitting on the pass
 *
 * A ticket redeems **once** — that property stops one ticket admitting two people, it is
 * transactional, tested, and enforced in `firestore.rules`. A pass that admitted at every
 * fixture would have to redeem twenty times, which means either weakening that rule for
 * everything or growing a second door path beside it.
 *
 * So buying a pass issues one ticket per covered event, through the issuance that already
 * exists. That is also what a season ticket has always physically been: a book of
 * tickets. Everything downstream — the door, zones, sessions, transfer, refunds — works
 * unchanged, because there is nothing new to work on.
 *
 * `tierIds` names which tier the pass takes in each event, so a pass consumes real
 * inventory in each one and a fixture cannot be oversold by pass holders nobody counted.
 */
export interface SeasonPass {
  id: string;
  organizerId: string;
  name: string;
  description?: string;
  /** What the whole pass costs, in major units, charged once. */
  price: number;
  currency: string;
  /** How many passes exist. */
  quantity: number;
  sold?: number;
  /** The events it covers, and the tier it takes in each. */
  eventIds: string[];
  tierIds: Record<string, string>;
  active: boolean;
  createdAt: string;

  /**
   * Automatic renewal between seasons. When this pass renews an earlier one, last season's
   * holders get first refusal: until `holderWindowEnds`, only someone who bought
   * `renewsPassId` may buy this pass — the renewal window — and it opens to everyone after.
   * Enforced server-side at checkout (a greyed-out button is not a gate), the same way the
   * loyalty presale is. Both optional; a pass with neither is an ordinary pass on open sale.
   */
  renewsPassId?: string;
  /** ISO 8601. While in the future, this pass sells only to holders of `renewsPassId`. */
  holderWindowEnds?: string;
}

/**
 * What an organiser's returning customers have earned.
 *
 * Computed from tickets rather than stored, for the same reason seat availability is:
 * a stored counter needs something to decrement it when a ticket is refunded, and there
 * is no such thing. A number derived from live tickets cannot drift.
 */
export type LoyaltyTier = 'none' | 'member' | 'regular' | 'patron';

export interface Membership {
  organizerId: string;
  userId: string;
  /** Distinct events attended — not tickets bought, which is mostly party size. */
  eventsAttended: number;
  hasSeasonPass: boolean;
  tier: LoyaltyTier;
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

/**
 * How the money for a box-office (door) sale was taken. Not a payment rail — the platform
 * moves none of it; the organiser collects it in person. It is recorded so a door sale can
 * be reconciled and so the service fee can be billed back to the organiser.
 */
export type BoxOfficeTender = 'cash' | 'card' | 'mobile_money';

/**
 * One door sale. The tickets themselves are issued through the normal payment_events →
 * issuance path (this is not a second way to mint them); this row is the financial record:
 * what was taken, by whom, and — because the organiser collected the whole amount — how
 * much service fee they now OWE the platform, to be shown on the dashboard and deducted at
 * payout. Keyed by the same id as its payment_event so the two always line up.
 */
export interface BoxOfficeSale {
  id: string;
  organizerId: string;
  eventId: string;
  eventTitle: string;
  tierId: string;
  tierName: string;
  tender: BoxOfficeTender;
  quantity: number;
  /** Minor units. face = organiser's money; serviceFee = owed to platform; total = what the buyer paid in person. */
  faceMinor: number;
  serviceFeeMinor: number;
  buyerTotalMinor: number;
  /** The service fee the organiser owes for this sale — reversed to 0 on refund. */
  feeOwedMinor: number;
  currency: string;
  status: 'issued' | 'refunded';
  /** How many of the sale's tickets have been refunded (whole sale is refunded when this hits quantity). */
  refundedCount?: number;
  /** 'door' for a PIN-authenticated staff sale, or the organiser's uid for a dashboard sale. */
  soldBy: string;
  buyerName?: string;
  buyerEmail?: string;
  createdAt: string;
  refundedAt?: string;
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
  /**
   * Chosen seats, when the line is a reserved-seating tier. The seats are advisory
   * until checkout, where the server locks them inside a hold — somebody may take
   * them between adding and paying, and the checkout says so rather than guessing.
   */
  seats?: string[];
  /** Attendee-type breakdown (Adult ×2, Child ×1). Server re-prices every entry. */
  mix?: Array<{ typeId: string; quantity: number }>;
}
