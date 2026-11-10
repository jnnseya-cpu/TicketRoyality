/**
 * Trend detection and scoring (external spec §5), embedded natively in this platform.
 *
 * Pure and deterministic on purpose: these functions turn the platform's own first-party
 * signals into an opportunity score, a confidence, and a decision band — with no I/O and
 * no model — so the maths can be proven before anything acts on it. The AI layer only
 * ever labels or explains; the numbers that gate a brief are computed here.
 *
 * Every weight, gate and band is the spec's. The worked example in §5 (and the §6 brief
 * fixture) is pinned in the tests: demand 80, fit 95, intent 85, timing 90, readiness 80
 * → 86.25; confidence inputs 90/2-families/70/90 → 83.5 → a reviewable brief.
 */

/* -------------------------------------------------------------------------- */
/* Per-source movement: log lift + robust anomaly score (§5.3)                */
/* -------------------------------------------------------------------------- */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation. */
function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export interface AnomalyOptions {
  /** Raw-count gate (count feeds only). */
  minCount: number;
  /** Robust z gate. */
  minZ: number;
  /** Below this many comparable periods, history is insufficient. */
  minHistory: number;
}

export const ANOMALY_DEFAULTS: AnomalyOptions = { minCount: 20, minZ: 2, minHistory: 4 };

export type AnomalyStatus = 'passed' | 'below_gate' | 'insufficient_history';

export interface AnomalyResult {
  status: AnomalyStatus;
  /** ln((c+1)/(b+1)) — the log lift over the baseline median. */
  lift: number;
  /** Robust z against the log-space history. */
  z: number;
  count: number;
  baselineMedian: number;
}

/**
 * Score one count-feed observation against its comparable history.
 * `c` = current count, `history` = prior comparable counts (e.g. the prior 8 weeks).
 * Never applies raw-count thresholds to an indexed feed — that is the caller's choice
 * of which gate to use; this is the count-feed gate.
 */
export function detectAnomaly(
  count: number,
  history: number[],
  options: AnomalyOptions = ANOMALY_DEFAULTS
): AnomalyResult {
  const baselineMedian = median(history);
  const lift = Math.log((count + 1) / (baselineMedian + 1));
  const logHist = history.map((x) => Math.log1p(x));
  const scale = Math.max(1.4826 * mad(logHist), 0.2);
  const z = (Math.log1p(count) - median(logHist)) / scale;

  if (history.length < options.minHistory) {
    return { status: 'insufficient_history', lift, z, count, baselineMedian };
  }
  const passed = count >= options.minCount && z >= options.minZ;
  return { status: passed ? 'passed' : 'below_gate', lift, z, count, baselineMedian };
}

/* -------------------------------------------------------------------------- */
/* Opportunity score and confidence (§5.4, §5.5)                              */
/* -------------------------------------------------------------------------- */

export interface OpportunityInputs {
  /** 0–100 each. */
  demand: number;
  fit: number;
  intent: number;
  timing: number;
  readiness: number;
  /** Hard veto reasons (out-of-market, unsupported claim, restricted, no inventory…). */
  vetoes?: string[];
}

export interface OpportunityResult {
  score: number;
  /** True when a hard veto or zero readiness blocks live activation. */
  vetoed: boolean;
  vetoes: string[];
}

const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

/** 25% demand, 25% platform fit, 20% commercial intent, 15% timing, 15% readiness. */
export function opportunityScore(input: OpportunityInputs): OpportunityResult {
  const score =
    0.25 * clamp100(input.demand) +
    0.25 * clamp100(input.fit) +
    0.2 * clamp100(input.intent) +
    0.15 * clamp100(input.timing) +
    0.15 * clamp100(input.readiness);

  const vetoes = [...(input.vetoes ?? [])];
  // Missing readiness blocks activation (§5.4).
  if (clamp100(input.readiness) === 0 && !vetoes.includes('no_readiness')) vetoes.push('no_readiness');

  return { score, vetoed: vetoes.length > 0, vetoes };
}

export interface ConfidenceInputs {
  /** 0–100 mean quality of the contributing source families. */
  sourceQuality: number;
  /** 0–100 observed/expected coverage. */
  coverage: number;
  /** 0–100 freshness. */
  freshness: number;
  /** Count of INDEPENDENT corroborating source families (relevant to same topic/market/time). */
  independentFamilies: number;
}

/** 0 for one family, 80 for two, 100 for three or more (§17). */
export function corroborationScore(independentFamilies: number): number {
  if (independentFamilies >= 3) return 100;
  if (independentFamilies === 2) return 80;
  return 0;
}

/** 35% source quality, 25% corroboration, 20% coverage, 20% freshness; single family capped at 69. */
export function confidenceScore(input: ConfidenceInputs): number {
  const corroboration = corroborationScore(input.independentFamilies);
  const raw =
    0.35 * clamp100(input.sourceQuality) +
    0.25 * corroboration +
    0.2 * clamp100(input.coverage) +
    0.2 * clamp100(input.freshness);
  // A single source family cannot carry more than 69 confidence, however good it is.
  return input.independentFamilies <= 1 ? Math.min(raw, 69) : raw;
}

/* -------------------------------------------------------------------------- */
/* Decision band (§5 table)                                                   */
/* -------------------------------------------------------------------------- */

export type Decision = 'archive' | 'watch' | 'reviewable_brief' | 'auto_eligible';

export interface ClassifyOptions {
  vetoed?: boolean;
  /** Explicit tenant opt-in required for bounded automatic action. */
  autoOptIn?: boolean;
}

/**
 * Map a score + confidence to the band that decides what may happen next. A veto can
 * never reach a live tier — the best a vetoed opportunity gets is `watch` (draft-only).
 */
export function classify(
  score: number,
  confidence: number,
  options: ClassifyOptions = {}
): Decision {
  if (score < 60 || confidence < 55) return 'archive';
  if (!options.vetoed && score >= 85 && confidence >= 85 && options.autoOptIn === true) {
    return 'auto_eligible';
  }
  if (!options.vetoed && score >= 75 && confidence >= 75) return 'reviewable_brief';
  return 'watch';
}
