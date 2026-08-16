/**
 * Pricing tests. Run with: npm run test:pricing
 *
 * These are the numbers the organiser dashboard renders, the payout service pays out
 * and the admin console audits. `src/shared/pricing.ts` exists so those three can never
 * disagree; this file exists so the one implementation cannot drift silently.
 *
 * The case that motivated it: `adminFee` was charged per line with no price check, so a
 * free ticket cost the organiser 50p. Percentage commission on £0 was already £0, which
 * is precisely why nobody noticed — the error was small, one-directional, and only
 * visible at volume.
 */
import assert from 'node:assert/strict';

import { commissionTermsFor, platformCutForTicket, settle, applyCoupon, availableInTier } from './pricing';
import {
  DEFAULT_ADMIN_FEE,
  DEFAULT_COMMISSION_PERCENT,
  TOPUP_PACKAGES_USD,
  WELCOME_BONUS_ACU,
  chargeForProviderCost,
  publicCharge,
} from './constants/billing';

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

const terms = commissionTermsFor();
/** Money compares to the penny; floating point does not compare exactly. */
const pennies = (value: number) => Math.round(value * 100);

console.log('\nPricing\n');

test('defaults are 5% + 50p', () => {
  assert.equal(terms.percent, DEFAULT_COMMISSION_PERCENT);
  assert.equal(terms.adminFee, DEFAULT_ADMIN_FEE);
  assert.equal(terms.percent, 5);
  assert.equal(terms.adminFee, 0.5);
});

test('a free ticket costs the organiser nothing', () => {
  assert.equal(platformCutForTicket(0, terms), 0);
});

test('a 300-place free guest list is free, not £150', () => {
  const lines = Array.from({ length: 300 }, () => ({ price: 0 }));
  const result = settle(lines, terms);
  assert.equal(pennies(result.platformTotal), 0, 'the platform takes nothing from a free list');
  assert.equal(pennies(result.adminFees), 0);
  assert.equal(pennies(result.net), 0);
});

test('a paid ticket is still charged 5% + 50p', () => {
  // £20 → £1.00 commission + £0.50 admin = £1.50
  assert.equal(pennies(platformCutForTicket(20, terms)), 150);
});

test('a mixed list charges the admin fee only on the paid tickets', () => {
  const lines = [{ price: 0 }, { price: 0 }, { price: 20 }];
  const result = settle(lines, terms);
  // gross £20 → commission £1.00, one admin fee £0.50
  assert.equal(pennies(result.gross), 2000);
  assert.equal(pennies(result.commission), 100);
  assert.equal(pennies(result.adminFees), 50);
  assert.equal(pennies(result.platformTotal), 150);
  assert.equal(pennies(result.net), 1850);
});

test('settle equals the sum of the per-ticket cut, so reports and payouts agree', () => {
  const lines = [{ price: 0 }, { price: 12.5 }, { price: 99.99 }, { price: 0 }, { price: 1 }];
  const total = settle(lines, terms).platformTotal;
  const perTicket = lines.reduce((sum, line) => sum + platformCutForTicket(line.price, terms), 0);
  assert.equal(
    pennies(total),
    pennies(perTicket),
    'the settlement and the per-ticket breakdown must be the same number'
  );
});

test('a donation tier above zero is a paid ticket', () => {
  // The free-ticket rule must not swallow a £1 contribution.
  assert.equal(pennies(platformCutForTicket(1, terms)), 55); // 5p + 50p
});

test('negotiated terms override the defaults', () => {
  const bespoke = commissionTermsFor({ commissionPercent: 2, adminFee: 0 });
  assert.equal(pennies(platformCutForTicket(100, bespoke)), 200);
  assert.equal(pennies(platformCutForTicket(0, bespoke)), 0);
});

test('an empty settlement is zero, not NaN', () => {
  const result = settle([], terms);
  assert.equal(result.gross, 0);
  assert.equal(result.platformTotal, 0);
  assert.equal(result.net, 0);
});

test('a percentage coupon never produces a negative total', () => {
  const coupon = {
    id: 'c1',
    code: 'HALF',
    discountType: 'percentage' as const,
    amount: 150,
    usageCount: 0,
    usageLimit: 10,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    organizerId: 'org',
    eventId: 'e1',
  };
  const check = applyCoupon(20, coupon as never);
  assert.ok(check.valid);
  assert.ok(check.valid && check.total >= 0, 'a customer must never be owed money by a coupon');
});

test('a fixed coupon cannot discount more than the subtotal', () => {
  const coupon = {
    id: 'c2',
    code: 'TENNER',
    discountType: 'fixed' as const,
    amount: 50,
    usageCount: 0,
    usageLimit: 10,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    organizerId: 'org',
    eventId: 'e1',
  };
  const check = applyCoupon(20, coupon as never);
  assert.ok(check.valid && pennies(check.discount) === 2000);
  assert.ok(check.valid && check.total === 0);
});

/* -------------------------------------------------------------------------- */
/* ACU                                                                        */
/* -------------------------------------------------------------------------- */

test('every account starts with 100 ACU free', () => {
  assert.equal(WELCOME_BONUS_ACU, 100);
});

test('top-up packages are $5, $10 and $15', () => {
  assert.deepEqual([...TOPUP_PACKAGES_USD], [5, 10, 15]);
});

test('the public charge never carries the provider cost or the markup', () => {
  // Widened through `unknown` deliberately: the point of the assertion is to inspect
  // the runtime shape, which the static type says nothing about.
  const view = publicCharge(0.004) as unknown as Record<string, unknown>;
  // The margin is internal (billing.ts). This is the guard that stops it being
  // reintroduced into an API response by a well-meaning edit six months from now.
  assert.deepEqual(Object.keys(view).sort(), ['acu', 'usd']);
  assert.equal(view.providerCostUsd, undefined);
  assert.equal(view.markupMultiplier, undefined);
  assert.equal(view.userChargeUsd, undefined);
});

test('the public charge still agrees with the internal one on price', () => {
  const internal = chargeForProviderCost(0.004);
  const view = publicCharge(0.004);
  assert.equal(view.acu, internal.acu, 'the customer must be charged what the ledger records');
  assert.equal(pennies(view.usd), pennies(internal.acu * 0.01));
});

test('a charge always rounds up to at least 1 ACU', () => {
  assert.equal(publicCharge(0.0000001).acu, 1, 'a real call is never free to the customer');
  assert.equal(publicCharge(0).acu, 0, 'but no call means no charge');
});

test('held seats reduce what is available to sell', () => {
  assert.equal(availableInTier({ quantity: 100, sold: 10, held: 5 }), 85);
  assert.equal(availableInTier({ quantity: 100 }), 100);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
