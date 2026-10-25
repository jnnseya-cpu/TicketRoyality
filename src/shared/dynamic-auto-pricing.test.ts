/**
 * Automatic dynamic pricing engine. `npm run test:auto-pricing`
 *
 * Money arithmetic, so every rule, bound and guardrail is pinned: the three triggers
 * fire when they should, increases beat a clearance decrease, caps and the floor hold
 * across repeated nudges, and a tier that is held, sold out, freshly changed or
 * untriggered is left exactly where it is.
 */
import assert from 'node:assert/strict';

import { evaluateAutoPricing, type EvalInput, type TierSnapshot } from './dynamic-auto-pricing';

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

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const tier = (over: Partial<TierSnapshot> = {}): TierSnapshot => ({
  id: 't1',
  name: 'General',
  price: 10,
  baseline: 10,
  quantity: 100,
  sold: 50,
  ...over,
});
const ev = (tiers: TierSnapshot[], over: Partial<EvalInput> = {}): EvalInput => ({
  now: NOW,
  daysUntilEvent: 30,
  tiers,
  ...over,
});

console.log('\nAutomatic dynamic pricing\n');

test('scarcity (<=25% left) raises by 15%', () => {
  const [c] = evaluateAutoPricing(ev([tier({ sold: 80 })])); // 20 left = 20%
  assert.equal(c.direction, 'increase');
  assert.equal(c.trigger, 'scarcity');
  assert.equal(c.toPrice, 11.5);
});

test('a rush (>=10% of stock since last sweep) raises by 15%', () => {
  const [c] = evaluateAutoPricing(ev([tier({ sold: 30, soldAtLastSweep: 18 })])); // +12
  assert.equal(c.trigger, 'rush');
  assert.equal(c.toPrice, 11.5);
});

test('an increase is capped at baseline +50%', () => {
  const [c] = evaluateAutoPricing(ev([tier({ price: 14, sold: 80 })])); // raw 16.1 -> cap 15
  assert.equal(c.toPrice, 15);
});

test('no change once a tier is already at the ceiling', () => {
  const out = evaluateAutoPricing(ev([tier({ price: 15, sold: 80 })])); // cap 15, raw would be 17.25
  assert.equal(out.length, 0);
});

test('slow sales within 14 days drop by 10%', () => {
  const [c] = evaluateAutoPricing(ev([tier({ sold: 30 })], { daysUntilEvent: 10 }));
  assert.equal(c.direction, 'decrease');
  assert.equal(c.trigger, 'slow_clearance');
  assert.equal(c.toPrice, 9);
});

test('a decrease is floored at baseline -30%', () => {
  const [c] = evaluateAutoPricing(ev([tier({ price: 7.5, sold: 30 })], { daysUntilEvent: 10 }));
  assert.equal(c.toPrice, 7); // raw 6.75 -> floor 7
});

test('a rush beats a clearance decrease on the same tier', () => {
  // inside the window, selling slowly overall, but rushing right now
  const [c] = evaluateAutoPricing(
    ev([tier({ sold: 40, soldAtLastSweep: 25 })], { daysUntilEvent: 10 })
  );
  assert.equal(c.direction, 'increase');
  assert.equal(c.trigger, 'rush');
});

test('a tier changed in the last 24h is left alone', () => {
  const out = evaluateAutoPricing(
    ev([tier({ sold: 80, lastChangeAt: NOW - 1 * HOUR })])
  );
  assert.equal(out.length, 0);
});

test('a tier with seats held in checkout is never repriced', () => {
  const out = evaluateAutoPricing(ev([tier({ sold: 80, held: 3 })]));
  assert.equal(out.length, 0);
});

test('a sold-out tier is skipped', () => {
  const out = evaluateAutoPricing(ev([tier({ sold: 100 })]));
  assert.equal(out.length, 0);
});

test('no trigger means no change', () => {
  const out = evaluateAutoPricing(ev([tier({ sold: 50 })], { daysUntilEvent: 30 }));
  assert.equal(out.length, 0);
});

test('slow sales OUTSIDE the 14-day window do not auto-decrease', () => {
  const out = evaluateAutoPricing(ev([tier({ sold: 30 })], { daysUntilEvent: 20 }));
  assert.equal(out.length, 0);
});

test('prices round to the penny', () => {
  const [c] = evaluateAutoPricing(ev([tier({ price: 9.99, baseline: 9.99, sold: 80 })]));
  assert.equal(c.toPrice, 11.49); // 9.99 * 1.15 = 11.4885
});

test('a zero/absent baseline is skipped rather than divided into nonsense', () => {
  const out = evaluateAutoPricing(ev([tier({ baseline: 0, sold: 80 })]));
  assert.equal(out.length, 0);
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
