import { detectAnomaly, opportunityScore, confidenceScore, classify, type Decision } from '@/shared/trend/scoring';

/**
 * The native signal pipeline (external spec §5), embedded and invisible.
 *
 * Pure and deterministic: it turns the platform's OWN first-party sales into weekly
 * observations per topic, aggregates them into a current-vs-history series, and scores
 * each topic. No I/O here — the cron service reads Firestore, calls these, and writes the
 * snapshots. End users never see any of it; it only feeds the existing agents.
 *
 * Signal choice is honest: TicketRoyality logs no search queries, so the available
 * first-party demand signal is tickets sold, grouped by event category and market. That
 * is a SINGLE source family, which the scoring layer caps at 69 confidence — so this
 * pipeline can only ever reach watch/draft, never a live action, until a second
 * independent family corroborates. That is the spec's intent, not a limitation to hide.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** A Monday, so week buckets align to calendar weeks (UTC). */
const WEEK_EPOCH = Date.UTC(2020, 0, 6);

function weekStartMs(t: number): number {
  return WEEK_EPOCH + Math.floor((t - WEEK_EPOCH) / WEEK) * WEEK;
}

/** One normalised observation: a count for a topic in a complete source-native window. */
export interface Observation {
  source_id: string;
  source_family: string;
  topic: string;
  market: string;
  window_start: string;
  window_end: string;
  observed_at: string;
  metric: string;
  value: number;
}

/** The minimum a ticket and its event must expose for the collector. Plain data, not the
 *  full domain type, so this stays pure and trivially testable. */
export interface SaleInput {
  eventId: string;
  purchasedAt: string;
  status: string;
}
export interface EventMeta {
  category: string;
  /** ISO country, or anything; falls back to 'ZZ' (global, non-country) when absent. */
  market?: string;
}

const SOLD = new Set(['valid', 'redeemed']);

/**
 * Turn raw sales into weekly per-(topic, market) observations over a lookback window.
 * Only completed sales count; refunds and cancellations are excluded.
 */
export function deriveSalesObservations(
  sales: SaleInput[],
  eventsById: Map<string, EventMeta>,
  now: number,
  lookbackWeeks = 10
): Observation[] {
  const cutoff = now - lookbackWeeks * WEEK;
  const counts = new Map<string, { topic: string; market: string; start: number; value: number }>();

  for (const sale of sales) {
    if (!SOLD.has(sale.status)) continue;
    const t = Date.parse(sale.purchasedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now) continue;
    const event = eventsById.get(sale.eventId);
    if (!event || !event.category) continue;

    const topic = event.category;
    const market = event.market || 'ZZ';
    const start = weekStartMs(t);
    const key = `${topic}|${market}|${start}`;
    const existing = counts.get(key);
    if (existing) existing.value += 1;
    else counts.set(key, { topic, market, start, value: 1 });
  }

  return [...counts.values()].map((c) => ({
    source_id: 'first_party_sales',
    source_family: 'first_party',
    topic: c.topic,
    market: c.market,
    window_start: new Date(c.start).toISOString(),
    window_end: new Date(c.start + WEEK).toISOString(),
    observed_at: new Date(c.start + WEEK).toISOString(),
    metric: 'tickets_sold',
    value: c.value,
  }));
}

export interface TopicSeries {
  topic: string;
  market: string;
  /** Most recent COMPLETE window's count. */
  current: number;
  /** Prior complete windows' counts, oldest→newest. */
  history: number[];
}

/**
 * Group observations by (topic, market) and split the latest COMPLETE window from its
 * history. A window still in progress (window_end in the future) is excluded, because the
 * spec scores complete source-native windows only — a half-finished week understates demand.
 */
export function aggregateByTopic(observations: Observation[], now: number): TopicSeries[] {
  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    if (Date.parse(o.window_end) > now) continue; // in-progress window
    const key = `${o.topic}|${o.market}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(o);
  }

  const series: TopicSeries[] = [];
  for (const [, list] of groups) {
    list.sort((a, b) => Date.parse(a.window_start) - Date.parse(b.window_start));
    const values = list.map((o) => o.value);
    const current = values[values.length - 1];
    series.push({
      topic: list[0].topic,
      market: list[0].market,
      current,
      history: values.slice(0, -1),
    });
  }
  return series;
}

/** Per-topic fit/intent/timing/readiness from a platform profile (spec §5.4). Neutral
 *  defaults when a topic has no profile, which keeps it draft-only rather than guessing high. */
export interface TopicProfile {
  fit: number;
  intent: number;
  timing: number;
  readiness: number;
  vetoes?: string[];
}
const NEUTRAL_PROFILE: TopicProfile = { fit: 50, intent: 50, timing: 50, readiness: 50 };

export interface OpportunitySnapshot {
  topic: string;
  market: string;
  demand: number;
  opportunity_score: number;
  confidence: number;
  decision: Decision;
  vetoed: boolean;
  anomaly_status: 'passed' | 'below_gate' | 'insufficient_history';
  z: number;
  evidence_windows: number;
  computed_at: string;
}

/**
 * Score every topic series into a snapshot. Demand is derived from the anomaly z
 * (clamp(50 + 10z), §17); fit/intent/timing/readiness come from the profile; confidence
 * is single-family (sales) and therefore capped at 69, so `decision` tops out at watch
 * until a second corroborating family exists.
 */
export function scoreTopics(
  series: TopicSeries[],
  now: number,
  profiles: Map<string, TopicProfile> = new Map()
): OpportunitySnapshot[] {
  return series.map((s) => {
    const anomaly = detectAnomaly(s.current, s.history);
    const demand = Math.min(100, Math.max(0, 50 + 10 * anomaly.z));
    const profile = profiles.get(s.topic) ?? NEUTRAL_PROFILE;
    const opp = opportunityScore({
      demand,
      fit: profile.fit,
      intent: profile.intent,
      timing: profile.timing,
      readiness: profile.readiness,
      vetoes: profile.vetoes,
    });
    // Sales is one independent family → corroboration 0 and the 69 cap.
    const confidence = confidenceScore({
      sourceQuality: 70,
      independentFamilies: 1,
      coverage: 100,
      freshness: 100,
    });
    // Insufficient history can never leave draft; force watch at most by vetoing live.
    const vetoed = opp.vetoed || anomaly.status === 'insufficient_history';
    return {
      topic: s.topic,
      market: s.market,
      demand,
      opportunity_score: opp.score,
      confidence,
      decision: classify(opp.score, confidence, { vetoed }),
      vetoed,
      anomaly_status: anomaly.status,
      z: anomaly.z,
      evidence_windows: s.history.length + 1,
      computed_at: new Date(now).toISOString(),
    };
  });
}
