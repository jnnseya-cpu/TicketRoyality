/**
 * Signal pipeline tests. `npm run test:trend-pipeline`
 *
 * Pins the invisible path end to end in pure form: completed sales become weekly
 * per-category observations (refunds excluded, out-of-window dropped, unknown events
 * skipped); aggregation splits the latest complete window from history and ignores the
 * in-progress week; and scoring caps a single-family signal at 69 confidence, so a real
 * sales spike reaches 'watch' and never a live action.
 */
import assert from 'node:assert/strict';

import {
  deriveSalesObservations,
  aggregateByTopic,
  scoreTopics,
  type SaleInput,
  type EventMeta,
} from './pipeline';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-09T00:00:00Z'); // a Monday 00:00 UTC

const events = new Map<string, EventMeta>([['e1', { category: 'music', market: 'GB' }]]);

/** Sold tickets for a category, `count` per week across `weeks` complete prior weeks
 *  plus `current` in the just-ended week. */
function salesSeries(current: number, weekly: number[]): SaleInput[] {
  const out: SaleInput[] = [];
  // current = the week that ends at NOW (starts NOW-WEEK)
  for (let i = 0; i < current; i += 1) {
    out.push({ eventId: 'e1', purchasedAt: new Date(NOW - WEEK + 60_000).toISOString(), status: 'valid' });
  }
  // history weeks, each further back
  weekly.forEach((n, idx) => {
    const start = NOW - WEEK * (idx + 2);
    for (let i = 0; i < n; i += 1) {
      out.push({ eventId: 'e1', purchasedAt: new Date(start + 60_000).toISOString(), status: 'valid' });
    }
  });
  return out;
}

console.log('\nTrend signal pipeline\n');

test('derive: completed sales become weekly per-category observations', () => {
  const sales = salesSeries(40, [10, 11, 9, 10, 10, 12, 8, 10]);
  const obs = deriveSalesObservations(sales, events, NOW);
  const music = obs.filter((o) => o.topic === 'music' && o.market === 'GB');
  assert.ok(music.length >= 9, `expected ≥9 weekly obs, got ${music.length}`);
  const current = music.find((o) => Date.parse(o.window_end) === NOW);
  assert.equal(current?.value, 40);
  assert.equal(current?.metric, 'tickets_sold');
});

test('derive: refunds/cancellations and unknown events are excluded', () => {
  const sales: SaleInput[] = [
    { eventId: 'e1', purchasedAt: new Date(NOW - WEEK + 60_000).toISOString(), status: 'valid' },
    { eventId: 'e1', purchasedAt: new Date(NOW - WEEK + 60_000).toISOString(), status: 'refunded' },
    { eventId: 'e1', purchasedAt: new Date(NOW - WEEK + 60_000).toISOString(), status: 'cancelled' },
    { eventId: 'ghost', purchasedAt: new Date(NOW - WEEK + 60_000).toISOString(), status: 'valid' },
  ];
  const obs = deriveSalesObservations(sales, events, NOW);
  const current = obs.find((o) => Date.parse(o.window_end) === NOW);
  assert.equal(current?.value, 1, 'only the one valid, known-event sale counts');
});

test('aggregate: latest complete window is current, prior is history', () => {
  const obs = deriveSalesObservations(salesSeries(40, [10, 11, 9, 10]), events, NOW);
  const [series] = aggregateByTopic(obs, NOW);
  assert.equal(series.topic, 'music');
  assert.equal(series.current, 40);
  assert.equal(series.history.length, 4);
});

test('aggregate: an in-progress week is excluded', () => {
  const sales: SaleInput[] = [
    // in the week that STARTS at NOW (ends in the future) — must be dropped
    { eventId: 'e1', purchasedAt: new Date(NOW + 60_000).toISOString(), status: 'valid' },
  ];
  // extend "now" so these are within lookback but the window is still open
  const later = NOW + 2 * 24 * 60 * 60 * 1000;
  const obs = deriveSalesObservations(sales, events, later);
  const series = aggregateByTopic(obs, later);
  assert.equal(series.length, 0, 'the open current week yields no complete series');
});

test('score: a real spike reaches watch, never live (single family caps confidence at 69)', () => {
  const obs = deriveSalesObservations(salesSeries(40, [10, 11, 9, 10, 10, 12, 8, 10]), events, NOW);
  const [snap] = scoreTopics(aggregateByTopic(obs, NOW), NOW);
  assert.equal(snap.anomaly_status, 'passed');
  assert.ok(snap.demand > 75, `demand should be high, got ${snap.demand}`);
  assert.ok(snap.confidence <= 69, `single source family cannot exceed 69, got ${snap.confidence}`);
  assert.equal(snap.decision, 'watch', 'confidence < 75 can never be a reviewable brief');
});

test('score: insufficient history is vetoed to watch at most', () => {
  const obs = deriveSalesObservations(salesSeries(40, [10, 11]), events, NOW); // only 2 prior weeks
  const [snap] = scoreTopics(aggregateByTopic(obs, NOW), NOW);
  assert.equal(snap.anomaly_status, 'insufficient_history');
  assert.equal(snap.vetoed, true);
  assert.notEqual(snap.decision, 'reviewable_brief');
  assert.notEqual(snap.decision, 'auto_eligible');
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
