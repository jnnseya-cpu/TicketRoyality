/**
 * Automatic dynamic pricing — the rule engine (docs/04 M26, owner spec 25 Oct 2026).
 *
 * Pure and deterministic on purpose. Price changes move real money and feed settlement,
 * so the arithmetic lives in one tested function with no I/O, no clock of its own and no
 * Firestore — the caller reads the event, calls this, and applies what it returns. That
 * is the only way a price rule can be proven correct before it is ever let near a live
 * tier.
 *
 * The owner's rules:
 *   - a tier at or below 25% remaining  -> INCREASE (scarcity)
 *   - a tier selling unusually fast      -> INCREASE (rush)
 *   - within 14 days and selling slowly  -> DECREASE (clearance)
 * Increases take precedence over a decrease on the same tier — a tier that is both near
 * sell-out and inside the final fortnight is succeeding, not stalling.
 *
 * Every change is bounded against the tier's BASELINE (its price when automatic mode was
 * switched on), never against the current price, so repeated nudges cannot compound past
 * the ceiling or floor. Caps and steps are the organiser's; the defaults are the values
 * the owner chose.
 */

export interface AutoPricingConfig {
  /** Each increase raises the current price by this % of itself. */
  increaseStepPct: number;
  /** Hard ceiling: price may never exceed baseline × (1 + this/100). */
  increaseCapPct: number;
  /** Each decrease lowers the current price by this % of itself. */
  decreaseStepPct: number;
  /** Hard floor: price may never fall below baseline × (1 − this/100). */
  decreaseFloorPct: number;
  /** At or below this % of a tier's stock remaining, increase (scarcity). */
  scarcityRemainingPct: number;
  /** Fraction of total capacity sold since the last sweep that counts as a rush. */
  rushFractionPerSweep: number;
  /** "Near the event" window, in days, for clearance decreases. */
  clearanceDays: number;
  /** Below this sell-through %, a tier inside the clearance window is "selling slowly". */
  clearanceSellThroughPct: number;
  /** A tier changed more recently than this many hours ago is left alone this sweep. */
  minHoursBetweenChanges: number;
}

/** The owner's chosen policy (25 Oct 2026): +15%/cap +50%, −10%/floor −30%. */
export const DEFAULT_AUTO_PRICING: AutoPricingConfig = {
  increaseStepPct: 15,
  increaseCapPct: 50,
  decreaseStepPct: 10,
  decreaseFloorPct: 30,
  scarcityRemainingPct: 25,
  rushFractionPerSweep: 0.1,
  clearanceDays: 14,
  clearanceSellThroughPct: 50,
  minHoursBetweenChanges: 24,
};

export interface TierSnapshot {
  id: string;
  name: string;
  /** Current live price. */
  price: number;
  /** Price when automatic mode was enabled — the fixed reference for caps and floor. */
  baseline: number;
  quantity: number;
  sold: number;
  /** Seats currently held in a live checkout. A held tier is never repriced. */
  held?: number;
  /** ms epoch of the last automatic change, or undefined if never changed. */
  lastChangeAt?: number;
  /** `sold` at the previous sweep, for the velocity (rush) signal. */
  soldAtLastSweep?: number;
}

export interface EvalInput {
  now: number;
  daysUntilEvent: number;
  tiers: TierSnapshot[];
  /** Overrides on top of DEFAULT_AUTO_PRICING. */
  config?: Partial<AutoPricingConfig>;
}

export type Trigger = 'scarcity' | 'rush' | 'slow_clearance';

export interface AutoChange {
  tierId: string;
  tierName: string;
  fromPrice: number;
  toPrice: number;
  direction: 'increase' | 'decrease';
  trigger: Trigger;
  /** Plain-English reason, for the organiser's notification and the audit log. */
  reason: string;
}

const HOUR = 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Evaluate every tier and return the changes to apply. A tier produces at most one change
 * per sweep, and a tier that triggers no rule produces none (so the result is empty when
 * nothing should move).
 */
export function evaluateAutoPricing(input: EvalInput): AutoChange[] {
  const cfg = { ...DEFAULT_AUTO_PRICING, ...(input.config ?? {}) };
  const changes: AutoChange[] = [];

  for (const tier of input.tiers) {
    // Guardrails that stop a change before any rule is even considered.
    if (!(tier.quantity > 0) || !(tier.baseline > 0) || !(tier.price > 0)) continue;
    if ((tier.held ?? 0) > 0) continue; // never move a price under a live checkout
    if (
      tier.lastChangeAt !== undefined &&
      input.now - tier.lastChangeAt < cfg.minHoursBetweenChanges * HOUR
    ) {
      continue; // changed too recently — let it settle
    }

    const remaining = Math.max(0, tier.quantity - tier.sold);
    if (remaining === 0) continue; // sold out: nothing left to reprice
    const remainingPct = (remaining / tier.quantity) * 100;
    const sellThroughPct = (tier.sold / tier.quantity) * 100;
    const recentSold = Math.max(0, tier.sold - (tier.soldAtLastSweep ?? tier.sold));
    const rushHit = recentSold / tier.quantity >= cfg.rushFractionPerSweep;
    const scarcityHit = remainingPct <= cfg.scarcityRemainingPct;

    const ceiling = round2(tier.baseline * (1 + cfg.increaseCapPct / 100));
    const floor = round2(tier.baseline * (1 - cfg.decreaseFloorPct / 100));

    // Increases take precedence over a clearance decrease on the same tier.
    if (scarcityHit || rushHit) {
      const raw = tier.price * (1 + cfg.increaseStepPct / 100);
      const toPrice = round2(Math.min(raw, ceiling));
      if (toPrice > tier.price) {
        const trigger: Trigger = scarcityHit ? 'scarcity' : 'rush';
        changes.push({
          tierId: tier.id,
          tierName: tier.name,
          fromPrice: tier.price,
          toPrice,
          direction: 'increase',
          trigger,
          reason:
            trigger === 'scarcity'
              ? `Only ${remaining} of ${tier.quantity} left (${Math.round(remainingPct)}%). Raised to ${toPrice} (cap ${ceiling}).`
              : `${recentSold} sold since the last check — demand is spiking. Raised to ${toPrice} (cap ${ceiling}).`,
        });
      }
      continue; // handled this tier
    }

    // Clearance decrease: near the event, selling slowly, and not currently rushing.
    if (
      input.daysUntilEvent <= cfg.clearanceDays &&
      sellThroughPct < cfg.clearanceSellThroughPct
    ) {
      const raw = tier.price * (1 - cfg.decreaseStepPct / 100);
      const toPrice = round2(Math.max(raw, floor));
      if (toPrice < tier.price) {
        changes.push({
          tierId: tier.id,
          tierName: tier.name,
          fromPrice: tier.price,
          toPrice,
          direction: 'decrease',
          trigger: 'slow_clearance',
          reason: `${Math.round(sellThroughPct)}% sold with ${input.daysUntilEvent} days to go. Lowered to ${toPrice} (floor ${floor}).`,
        });
      }
    }
  }

  return changes;
}
