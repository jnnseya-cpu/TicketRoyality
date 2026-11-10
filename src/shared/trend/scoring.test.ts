/**
 * Trend scoring tests. `npm run test:trend-scoring`
 *
 * Pins the spec's maths: the §5 worked example (86.25 opportunity, 83.5 confidence →
 * reviewable brief), the single-source-family confidence cap, the corroboration mapping,
 * the veto that keeps a high score out of a live tier, and the count-feed anomaly gate.
 */
import assert from 'node:assert/strict';

import {
  detectAnomaly,
  opportunityScore,
  confidenceScore,
  corroborationScore,
  classify,
} from './scoring';

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
const approx = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

console.log('\nTrend scoring\n');

test('§5 example: opportunity score is 86.25', () => {
  const r = opportunityScore({ demand: 80, fit: 95, intent: 85, timing: 90, readiness: 80 });
  approx(r.score, 86.25);
  assert.equal(r.vetoed, false);
});

test('§5 example: confidence is 83.5 (two families, no cap)', () => {
  approx(confidenceScore({ sourceQuality: 90, independentFamilies: 2, coverage: 70, freshness: 90 }), 83.5);
});

test('§5 example classifies as a reviewable brief', () => {
  assert.equal(classify(86.25, 83.5), 'reviewable_brief');
});

test('zero readiness vetoes activation and drops to watch', () => {
  const r = opportunityScore({ demand: 90, fit: 90, intent: 90, timing: 90, readiness: 0 });
  assert.equal(r.vetoed, true);
  assert.ok(r.vetoes.includes('no_readiness'));
  // Even a high score + confidence cannot reach a live tier when vetoed.
  assert.equal(classify(r.score, 90, { vetoed: true, autoOptIn: true }), 'watch');
});

test('a single source family caps confidence at 69', () => {
  // raw would be 0.35*100 + 0 + 0.2*100 + 0.2*100 = 75, capped to 69.
  approx(confidenceScore({ sourceQuality: 100, independentFamilies: 1, coverage: 100, freshness: 100 }), 69);
});

test('corroboration maps families to 0 / 80 / 100', () => {
  assert.equal(corroborationScore(1), 0);
  assert.equal(corroborationScore(2), 80);
  assert.equal(corroborationScore(5), 100);
});

test('decision bands follow the §5 table', () => {
  assert.equal(classify(59, 90), 'archive'); // score below cutoff
  assert.equal(classify(90, 54), 'archive'); // confidence below cutoff
  assert.equal(classify(70, 60), 'watch'); // both above archive, below brief
  assert.equal(classify(76, 76), 'reviewable_brief');
  assert.equal(classify(90, 90, { autoOptIn: true }), 'auto_eligible');
  assert.equal(classify(90, 90), 'reviewable_brief'); // no opt-in → not auto
  assert.equal(classify(90, 90, { autoOptIn: true, vetoed: true }), 'watch'); // veto blocks auto
});

test('anomaly: a clear spike over stable history passes the count gate', () => {
  const r = detectAnomaly(40, [10, 10, 12, 9, 11, 10, 10, 8]);
  assert.equal(r.status, 'passed');
  assert.ok(r.z >= 2 && r.count >= 20);
});

test('anomaly: below the raw-count gate does not pass', () => {
  const r = detectAnomaly(15, [10, 10, 12, 9, 11, 10, 10, 8]);
  assert.equal(r.status, 'below_gate'); // c < 20
});

test('anomaly: fewer than four comparable periods is insufficient history', () => {
  const r = detectAnomaly(40, [10, 10, 12]);
  assert.equal(r.status, 'insufficient_history');
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
