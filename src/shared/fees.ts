import {
  ZERO_FEE_CONFIG,
  type CountryPricing,
  type FeeConfig,
  type PaymentRail,
} from '@/shared/constants/fees';

/**
 * The pricing engine. One implementation, everywhere.
 *
 * The organiser is charged nothing and receives 100% of face value. All standard
 * platform revenue is a buyer-side service fee, and the all-in total is computed here so
 * that every surface in the product shows the same number.
 *
 * ## Why this is one module and not a convenience
 *
 * UK price-transparency rules require a mandatory fee to be inside the first price a
 * buyer sees. The CMA can fine up to 10% of worldwide turnover or £300,000, whichever is
 * greater, and does not have to prove anyone was harmed — the AA/BSM action in April
 * 2026 was over a £3 booking fee missing from an upfront price.
 *
 * The engineering consequence is that the fee is a **catalogue** concern, not a checkout
 * concern. A second copy of this arithmetic in a card component is how an event card
 * shows £50.00 and a checkout charges £52.49, which is the violation itself. So there is
 * exactly one exported way to get a price, and it includes the fee.
 *
 * ## Integer minor units, everywhere
 *
 * `pricing.ts` carries money as floating-point pounds and flags the move to minor units
 * as pending. This module does not compromise: a percentage of a percentage is one
 * rounding error away from a penny difference between the price displayed and the price
 * charged, and that penny is the compliance failure. `toMinor`/`toMajor` at the bottom
 * are the only crossing point between the two conventions.
 *
 * ## No payment-method surcharge
 *
 * `computeOrderFees` takes a rail, and the rail changes **cost**, never **price**. UK law
 * bans consumer card surcharges; a fee that moved because a buyer picked a particular
 * card would be one. The rail exists so the platform can tell whether a rail earns its
 * keep, not so the buyer can be charged differently for using it.
 */

export interface OrderLine {
  /** Face value of one ticket, in minor units. Zero for a free ticket. */
  faceMinor: number;
  qty: number;
}

export type Health = 'healthy' | 'warning' | 'critical' | 'loss';

export interface OrderQuote {
  configVersion: string;
  countryCode: string;
  currency: string;
  pricingVersion: number;

  /** Sum of face value. This is the organiser's money and nothing subtracts from it. */
  faceMinor: number;
  /** Buyer-side service fee, VAT inclusive where the country says so. */
  serviceFeeMinor: number;
  /**
   * The part of `serviceFeeMinor` that exists because of the payment rail — today only
   * the 2% Congolese mobile-money charge. Never a separate line on a receipt; kept
   * separate for the ledger, because it funds manual verification rather than the
   * platform generally.
   */
  railSurchargeMinor: number;
  /** The fee excluding VAT — what the platform actually keeps. */
  serviceFeeNetMinor: number;
  vatOnFeeMinor: number;
  /** The only number a buyer is ever shown next to a purchase. */
  buyerTotalMinor: number;
  /** Always equal to `faceMinor`. There is no code path that reduces it. */
  organiserPayoutMinor: number;

  rail: PaymentRail;
  economics: {
    /** Attributable variable cost of earning this fee. */
    directCostMinor: number;
    grossContributionMinor: number;
    /** Revenue ÷ cost. 2.0 is the floor. `null` when there is no cost to divide by. */
    costMultiple: number | null;
    health: Health;
    meetsFloor: boolean;
  };
}

/** Round half-up. Amounts here are never negative, so `Math.round` is exact. */
function round(value: number): number {
  return Math.round(value);
}

function countryFor(cfg: FeeConfig, countryCode?: string): CountryPricing {
  const country = cfg.countries[countryCode ?? cfg.defaultCountry];
  if (!country || !country.active) {
    // Failing loudly beats quietly pricing an unconfigured market at UK rates. §19 asks
    // for a country launch to be blocked until its unit economics are proved; an
    // unconfigured country reaching a buyer is the same failure arriving by accident.
    throw new Error(
      `No active pricing for country "${countryCode}". Configure it before selling there.`
    );
  }
  return country;
}

/**
 * The service fee on one paid ticket.
 *
 * Per ticket, not per order — the later brief is explicit, and its worked examples only
 * reproduce on a per-ticket basis. Free tickets are zero and are not merely cheap: a
 * 300-place wedding guest list or a church service must cost the organiser and the guest
 * nothing at all.
 */
export function serviceFeeForTicket(
  faceMinor: number,
  country: CountryPricing = ZERO_FEE_CONFIG.countries.GB
): number {
  if (faceMinor <= 0) return 0;

  let fee = round((faceMinor * country.buyerServicePct) / 100) + country.buyerFixedFeeMinor;

  if (country.minimumServiceFeeMinor !== null) {
    fee = Math.max(fee, country.minimumServiceFeeMinor);
  }
  if (country.maximumServiceFeeMinor !== null) {
    fee = Math.min(fee, country.maximumServiceFeeMinor);
  }

  return fee;
}

/**
 * The authoritative quote.
 *
 * Pure: same inputs, same output, no clock, no I/O. That is what lets it run on the
 * client for display and on the server for the charge and produce the same number, and
 * what makes the profitability floor a CI test rather than a dashboard nobody reads.
 */
export function computeOrderFees(
  lines: OrderLine[],
  options: { rail?: PaymentRail; countryCode?: string; cfg?: FeeConfig } = {}
): OrderQuote {
  const cfg = options.cfg ?? ZERO_FEE_CONFIG;
  const rail = options.rail ?? 'stripe_uk_card';
  const country = countryFor(cfg, options.countryCode);

  const paid = lines.filter((line) => line.faceMinor > 0 && line.qty > 0);

  const baseFeeMinor = paid.reduce(
    (total, line) => total + serviceFeeForTicket(line.faceMinor, country) * line.qty,
    0
  );

  /*
   * Rail surcharge — the 2% Congolese mobile-money service charge, generalised.
   *
   * Folded into the one service fee rather than shown as a second line. The buyer sees
   * "TicketRoyality Service Fee" and one number, which is what §11 asks for; the split
   * survives in `railSurchargeMinor` for the ledger, because a charge that covers manual
   * verification work is a different revenue line internally even when it is the same
   * line on the receipt.
   *
   * It never surprises anyone, because `allInTicketPriceMinor` advertises the worst rail.
   */
  const surchargePct = country.buyerRailSurchargePct[rail] ?? 0;
  const railSurchargeMinor =
    baseFeeMinor > 0 && surchargePct > 0
      ? round((paid.reduce((t, l) => t + l.faceMinor * l.qty, 0) * surchargePct) / 100)
      : 0;

  const serviceFeeMinor = baseFeeMinor + railSurchargeMinor;

  const serviceFeeNetMinor =
    country.vatMode === 'inclusive'
      ? round(serviceFeeMinor / (1 + country.vatRatePct / 100))
      : serviceFeeMinor;
  const vatOnFeeMinor = serviceFeeMinor - serviceFeeNetMinor;

  const faceMinor = lines.reduce((total, line) => total + line.faceMinor * line.qty, 0);
  const buyerTotalMinor = faceMinor + serviceFeeMinor;

  /*
   * Attributable cost.
   *
   * Only the cost of earning the fee is counted. The rail's percentage on *face value*
   * is real money the platform spends, and it is not free — it is the priced cost of the
   * "organiser keeps 100%" promise, booked as acquisition cost rather than as a cost of
   * the fee product. That is the standard basis for a marketplace take-rate, and it is
   * the difference between a model that clears the floor comfortably and one that cannot
   * clear it at any competitive fee, because face value dwarfs the fee on every basket.
   */
  const railCost = cfg.costs.rails[rail];
  const railOnFee = round((serviceFeeMinor * railCost.pct) / 100);
  const hasFee = serviceFeeMinor > 0;
  const directCostMinor = hasFee
    ? railOnFee + railCost.fixedPence + cfg.costs.platformFixedPerOrderMinor
    : 0;

  const grossContributionMinor = serviceFeeNetMinor - directCostMinor;
  const costMultiple = directCostMinor === 0 ? null : serviceFeeNetMinor / directCostMinor;

  return {
    configVersion: cfg.version,
    countryCode: country.countryCode,
    currency: country.currency,
    pricingVersion: country.version,

    faceMinor,
    serviceFeeMinor,
    railSurchargeMinor,
    serviceFeeNetMinor,
    vatOnFeeMinor,
    buyerTotalMinor,
    // P3, written as the untouched sum rather than as a subtraction from anything.
    organiserPayoutMinor: faceMinor,

    rail,
    economics: {
      directCostMinor,
      grossContributionMinor,
      costMultiple,
      health: healthFor(costMultiple, grossContributionMinor),
      meetsFloor: costMultiple === null || costMultiple >= cfg.minimumCostMultiple,
    },
  };
}

/** §18's bands, unchanged. */
function healthFor(costMultiple: number | null, contribution: number): Health {
  if (costMultiple === null) return 'healthy';
  if (contribution < 0) return 'loss';
  if (costMultiple >= 2) return 'healthy';
  if (costMultiple >= 1.5) return 'warning';
  return 'critical';
}

/**
 * The all-in price of one ticket — what a card, a search result, a share preview or an
 * email must show.
 *
 * There is deliberately no export from this module that formats a face value as a price.
 * "From £50" on a card where every buyer pays £52.49 is the drip-pricing pattern the
 * rules make automatically unfair, and the way to not ship it is to make it unavailable.
 */
export function allInTicketPriceMinor(
  faceMinor: number,
  options: { countryCode?: string; cfg?: FeeConfig } = {}
): number {
  if (faceMinor <= 0) return 0;
  const cfg = options.cfg ?? ZERO_FEE_CONFIG;
  const country = countryFor(cfg, options.countryCode);

  // The worst rail, always. Where a rail carries its own buyer charge — the Congolese
  // mobile-money 2% — the advertised price contains it, so picking a card at checkout
  // lowers the total rather than raising it. Advertising the cheapest rail and adding
  // the difference later is the drip-pricing pattern itself.
  const worstSurcharge = Math.max(0, ...Object.values(country.buyerRailSurchargePct));
  const surcharge = worstSurcharge > 0 ? round((faceMinor * worstSurcharge) / 100) : 0;

  return faceMinor + serviceFeeForTicket(faceMinor, country) + surcharge;
}

/* ------------------------------------------------------------------------- */
/* Config guard — §19, as a pure function so CI can be the enforcement.       */
/* ------------------------------------------------------------------------- */

export const CANONICAL_BASKETS: Array<{ label: string; lines: OrderLine[] }> = [
  { label: '1 × £5', lines: [{ faceMinor: 500, qty: 1 }] },
  { label: '1 × £10', lines: [{ faceMinor: 1000, qty: 1 }] },
  { label: '2 × £10', lines: [{ faceMinor: 1000, qty: 2 }] },
  { label: '1 × £25', lines: [{ faceMinor: 2500, qty: 1 }] },
  { label: '2 × £25', lines: [{ faceMinor: 2500, qty: 2 }] },
  { label: '1 × £50', lines: [{ faceMinor: 5000, qty: 1 }] },
  { label: '4 × £25', lines: [{ faceMinor: 2500, qty: 4 }] },
  { label: '1 × £100', lines: [{ faceMinor: 10000, qty: 1 }] },
  { label: '1 × £250', lines: [{ faceMinor: 25000, qty: 1 }] },
  { label: '1 × £1 (worst case)', lines: [{ faceMinor: 100, qty: 1 }] },
  {
    label: 'mixed free + 1 × £10',
    lines: [
      { faceMinor: 0, qty: 3 },
      { faceMinor: 1000, qty: 1 },
    ],
  },
  { label: '300 free places', lines: [{ faceMinor: 0, qty: 300 }] },
];

export interface FloorBreach {
  basket: string;
  rail: PaymentRail;
  countryCode: string;
  costMultiple: number;
  contributionMinor: number;
}

export interface ConfigAudit {
  /** Hard invariant. Any entry here means the platform pays to take an order. */
  losses: FloorBreach[];
  /** Below the 2× target but still contributing. §18 calls this WARNING, not a breach. */
  belowTarget: FloorBreach[];
}

/**
 * Simulates every canonical basket on every rail in every active country.
 *
 * ## Why this returns two lists rather than one
 *
 * The brief asks for two things that cannot both be absolute at these prices. §21 says
 * loss-making transactions are not permitted; §4 sets revenue ≥ 2× attributable cost.
 * But §22's own worked example puts a £5 ticket at a 69p fee, and 69p cannot reach 2×
 * against a 20p card fixed fee: net of VAT it is 58p against 31p of cost, a 1.87×
 * multiple and a 27p contribution. **No fee at that level can**, because the fixed card
 * cost does not shrink with the ticket.
 *
 * §18's health bands already anticipate this — they define 1.5–2.0× as WARNING rather
 * than as a failure, which only makes sense if some real orders land there.
 *
 * So the hard invariant is the one that is actually absolute: **no order may lose
 * money.** The 2× multiple is a target, measured and reported per basket, and the test
 * pins exactly which baskets sit under it so that a config change moving more traffic
 * below the line is visible in a diff rather than discovered in a quarterly account.
 *
 * Raising `minimumServiceFeeMinor` to 75p would clear 2× everywhere — at the cost of the
 * published £5 → £0.69 example. That is a commercial decision, not an engineering one,
 * and it is not made here.
 */
export function validateFeeConfig(cfg: FeeConfig = ZERO_FEE_CONFIG): ConfigAudit {
  const losses: FloorBreach[] = [];
  const belowTarget: FloorBreach[] = [];
  const rails = Object.keys(cfg.costs.rails) as PaymentRail[];

  for (const country of Object.values(cfg.countries)) {
    if (!country.active) continue;
    for (const rail of rails) {
      for (const basket of CANONICAL_BASKETS) {
        const quote = computeOrderFees(basket.lines, {
          rail,
          countryCode: country.countryCode,
          cfg,
        });
        // No fee means no revenue and no attributable cost. Neither list applies.
        if (quote.serviceFeeMinor === 0) continue;

        const entry: FloorBreach = {
          basket: basket.label,
          rail,
          countryCode: country.countryCode,
          costMultiple: quote.economics.costMultiple ?? 0,
          contributionMinor: quote.economics.grossContributionMinor,
        };

        if (quote.economics.health === 'loss') losses.push(entry);
        else if (!quote.economics.meetsFloor) belowTarget.push(entry);
      }
    }
  }

  return { losses, belowTarget };
}

/* ------------------------------------------------------------------------- */
/* Bridge to the float-pounds convention used by pricing.ts.                  */
/* ------------------------------------------------------------------------- */

export function toMinor(major: number): number {
  return round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}
