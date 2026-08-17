/**
 * Margin tests. Run with: npm run test:margin
 *
 * These live in `backend/` rather than beside the other pricing tests because the module
 * they cover is server-only, and `shared/` is forbidden from importing `backend/` — the
 * lint rule that enforces the layering is the same one that keeps the multiplier out of
 * the client bundle, so it is not something to switch off for a test's convenience.
 *
 * What is being pinned: the customer-facing shape carries the price and nothing else.
 * The margin reached the public pricing page once already; this is the guard that stops
 * it being reintroduced into an API response by a well-meaning edit.
 */
import assert from 'node:assert/strict';

import { MARKUP_MULTIPLIER, chargeForProviderCost, publicCharge } from './margin';
import { ACU_USD_RATE } from '@/shared/constants/billing';

const results: Array<[string, boolean, string]> = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true, '']);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push([name, false, message]);
    console.error(`  ✗ ${name}\n      ${message.split('\n')[0]}`);
  }
}

const pennies = (value: number) => Math.round(value * 100);

console.log('\nAI margin\n');

test('the public charge carries only the price', () => {
  // Widened through `unknown` deliberately: the assertion is about the runtime shape,
  // which the static type says nothing about.
  const view = publicCharge(0.004) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(view).sort(), ['acu', 'usd']);
  assert.equal(view.providerCostUsd, undefined);
  assert.equal(view.markupMultiplier, undefined);
  assert.equal(view.userChargeUsd, undefined);
});

test('the public charge agrees with the ledger on what is owed', () => {
  const internal = chargeForProviderCost(0.004);
  const view = publicCharge(0.004);
  assert.equal(view.acu, internal.acu, 'the customer must be charged what the ledger records');
  assert.equal(pennies(view.usd), pennies(internal.acu * ACU_USD_RATE));
});

test('a charge rounds up to at least 1 ACU, and nothing costs nothing', () => {
  assert.equal(publicCharge(0.0000001).acu, 1, 'a real call is never free to the customer');
  assert.equal(publicCharge(0).acu, 0, 'but no call means no charge');
});

test('the internal breakdown still reports cost and markup for audit', () => {
  const internal = chargeForProviderCost(0.01);
  assert.equal(internal.providerCostUsd, 0.01);
  assert.equal(internal.markupMultiplier, MARKUP_MULTIPLIER);
  assert.equal(pennies(internal.userChargeUsd), pennies(0.01 * MARKUP_MULTIPLIER));
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
