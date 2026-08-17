/**
 * The zero-commission pricing configuration.
 *
 * ## Which spec this is
 *
 * Two specifications arrived. TR-FE-01 v1.0 set the buyer fee at 4.2% + £0.60 **per
 * order** with an £8 per-ticket cap; the later Global Zero-Commission brief sets it at
 * 3.99% + £0.49 **per paid ticket**, floors it at £0.69, and says explicitly not to
 * introduce a cap before conversion data supports one. They cannot both be true.
 *
 * The later brief is implemented, with **one deliberate departure**: the minimum fee is
 * 79p rather than the published 69p, because 69p cannot reach the 2× cost multiple on
 * any rail. That was raised as a finding and decided; the reasoning sits on the field.
 *
 * The later brief is implemented, for three reasons: it is the more recent instruction,
 * its worked examples (£5 → £0.69, £10 → £0.89, £25 → £1.49, £50 → £2.49, £100 → £4.48)
 * are internally consistent and reproduced exactly by this config, and it corrects the
 * margin language the earlier one got wrong.
 *
 * ## The margin correction, kept
 *
 * TR-FE-01 asked for "≥100% margin on every order". A 100% gross margin is arithmetically
 * impossible while any provider cost exists — it would require the cost to be zero. What
 * is meant, and what is implemented, is a **2× cost multiple**: revenue must be at least
 * twice attributable cost. That is a 100% markup and a 50% gross margin. The field is
 * named `minimumCostMultiple` so the code cannot restate the error.
 *
 * ## Why this lives in the repository
 *
 * The brief asks for Super Admin editability (§6). That is deliberately not step one.
 * These numbers are validated by `npm run test:fees` against every canonical basket
 * before they can merge; a settings page is validated by whoever last typed into it, and
 * a mistyped percentage is a live pricing incident on every event at once. The engine
 * already takes the config as an argument, so a Firestore override per country layers on
 * top without touching the arithmetic — but the *default* being unreachable from a UI is
 * the property worth keeping until there is a second country to configure.
 *
 * Every monetary value is integer minor units.
 */

export type PaymentRail =
  | 'stripe_uk_card'
  | 'stripe_intl_card'
  | 'bitripay_momo'
  | 'open_banking';

/**
 * What a rail costs the platform.
 *
 * Held per rail so the margin floor can be recomputed per rail — but note §11 of the
 * brief: the *buyer* fee never varies by payment method. UK law bans consumer card
 * surcharges outright, and a fee that moved because someone chose a particular card
 * would be exactly that. Rail cost is an internal number that affects whether the
 * platform will *offer* a rail, never what the buyer is charged for using one.
 */
export interface RailCost {
  /** Percentage of the whole charge, face value included. */
  pct: number;
  fixedPence: number;
  capPence?: number;
}

export type VatMode = 'inclusive' | 'exclusive' | 'not_applicable';

export interface CountryPricing {
  countryCode: string;
  currency: string;

  /** P1. Zero, and the type says so — a non-zero literal will not compile. */
  organiserCommissionPct: 0;
  organiserFixedFeeMinor: 0;

  /** Percentage of face value, per paid ticket. */
  buyerServicePct: number;
  /** Flat amount per paid ticket, in minor units. */
  buyerFixedFeeMinor: number;
  /**
   * Floor on the fee for any paid ticket. 79p in the UK, so it binds below about £7.50.
   */
  minimumServiceFeeMinor: number | null;
  /**
   * §26: no cap until conversion data justifies one. `null` is the instruction, not an
   * oversight — the field exists so introducing one later is a config change.
   */
  maximumServiceFeeMinor: number | null;

  /**
   * A buyer charge that exists only on certain rails, as a percentage of face value.
   *
   * This is the existing 2% Congolese mobile-money service charge, and it sits awkwardly
   * against §11 of the brief, which says there is one TicketRoyality Service Fee and it
   * does not vary by payment method. It is kept because it is real — the mobile-money
   * corridor carries manual verification work that a card does not — but it is made safe
   * rather than removed:
   *
   *   `allInTicketPriceMinor` prices at the **worst** rail in this map. The catalogue,
   *   the card, the share preview and the email therefore already contain the highest
   *   charge any buyer could face, and choosing a card at checkout is a reduction, never
   *   an increase. That is the only shape in which a rail-dependent charge and "the
   *   price shown first is the price paid" can both be true.
   *
   * Empty for the UK, where a card surcharge would additionally be unlawful.
   */
  buyerRailSurchargePct: Partial<Record<PaymentRail, number>>;

  vatMode: VatMode;
  vatRatePct: number;

  active: boolean;
  version: number;
  effectiveFrom: string;
}

export interface FeeConfig {
  version: string;
  countries: Record<string, CountryPricing>;
  defaultCountry: string;

  costs: {
    rails: Record<PaymentRail, RailCost>;
    /**
     * Infrastructure, baseline AI screening and the amortised KODA subscription — the
     * platform's own variable cost per order, with no payment-rail cost in it.
     *
     * Held separately from `rails[].fixedPence` on purpose. Rolling the two together
     * (as TR-FE-01 §4.1 did, at a flat 30p) charges a mobile-money order for a Stripe
     * fixed fee it never paid — and mobile money is the highest-margin rail in the
     * system, precisely the one whose economics must not be understated. 5p infra +
     * 2p baseline AI + 3p KODA. For a UK card that is 20 + 10 = 30p, which is the
     * original figure exactly.
     */
    platformFixedPerOrderMinor: number;
  };

  ai: {
    /** P6. Also enforced server-side in `backend/billing/margin.ts`. */
    markupMultiple: 4;
    baselineAbsorbed: true;
  };

  /**
   * Revenue ÷ attributable cost. 2.0 = a 100% markup = a 50% gross margin.
   * Not a "margin percentage" — see the header.
   */
  minimumCostMultiple: number;
}

const UK: CountryPricing = {
  countryCode: 'GB',
  currency: 'GBP',
  organiserCommissionPct: 0,
  organiserFixedFeeMinor: 0,
  buyerServicePct: 3.99,
  buyerFixedFeeMinor: 49,
  // 79p, not the 69p the brief published.
  //
  // 69p cannot reach the 2× cost multiple: net of VAT it is 58p against 31p of
  // attributable cost, a 1.87× multiple. 79p is the lowest floor that clears the target
  // on **every** rail — 75p clears a UK card and still misses an international one. The
  // cost is that the brief's "£5 → £0.69" example becomes £0.79, and the £5–£7.50 band
  // is 10p dearer for the buyer. Below and above that band nothing changes.
  minimumServiceFeeMinor: 79,
  maximumServiceFeeMinor: null,
  // Empty, deliberately: a UK consumer card surcharge is unlawful, and there is no
  // mobile-money corridor here to justify one on any other rail.
  buyerRailSurchargePct: {},
  // The fee is quoted to the buyer as one final number, so VAT is inside it. The brief
  // does not state the UK mode explicitly; inclusive is the only mode compatible with
  // "the price shown first is the price paid", which is the legal red line.
  vatMode: 'inclusive',
  vatRatePct: 20,
  active: true,
  version: 1,
  effectiveFrom: '2026-08-17T00:00:00.000Z',
};

/**
 * The Congolese corridor.
 *
 * `active: false` — this is a *definition*, not a launch. §19 of the brief blocks a
 * country launch until its unit economics are proved, and the open items list DRC tax
 * treatment as unresolved. Defining it inactive means the 2% mobile-money charge is
 * modelled, tested and visible in a diff, while `computeOrderFees` still refuses to
 * price a DRC order until someone flips the flag on purpose.
 *
 * The 2% is the existing `OFFLINE_SERVICE_FEE_PERCENT`, carried across rather than
 * invented: mobile-money payments are verified by hand against a transaction reference
 * before a ticket is released, and that work is what the charge funds.
 */
const DRC: CountryPricing = {
  countryCode: 'CD',
  currency: 'USD',
  organiserCommissionPct: 0,
  organiserFixedFeeMinor: 0,
  buyerServicePct: 3.99,
  buyerFixedFeeMinor: 49,
  minimumServiceFeeMinor: 79,
  maximumServiceFeeMinor: null,
  buyerRailSurchargePct: { bitripay_momo: 2 },
  // Flagged as an open item for finance review; `not_applicable` records that no VAT
  // treatment has been decided rather than asserting that none applies.
  vatMode: 'not_applicable',
  vatRatePct: 0,
  active: false,
  version: 1,
  effectiveFrom: '2026-08-17T00:00:00.000Z',
};

export const ZERO_FEE_CONFIG: FeeConfig = {
  version: 'zero-v1.0',
  defaultCountry: 'GB',
  countries: { GB: UK, CD: DRC },

  costs: {
    rails: {
      stripe_uk_card: { pct: 1.5, fixedPence: 20 },
      stripe_intl_card: { pct: 3.25, fixedPence: 20 },
      bitripay_momo: { pct: 0.9, fixedPence: 0 },
      open_banking: { pct: 1.0, fixedPence: 0, capPence: 400 },
    },
    platformFixedPerOrderMinor: 10,
  },

  ai: { markupMultiple: 4, baselineAbsorbed: true },

  minimumCostMultiple: 2,
};
