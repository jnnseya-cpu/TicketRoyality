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

import {
  expandMix,
  resolveMix,
  applyCoupon,
  availableInTier,
  CHOSEN_PRICE_CEILING,
  commissionTermsFor,
  leadPrice,
  platformCutForTicket,
  resolveLinePrice,
  settle,
  tierSaleWindow,
} from './pricing';
import {
  DEFAULT_ADMIN_FEE,
  DEFAULT_COMMISSION_PERCENT,
  TOPUP_PACKAGES_USD,
  WELCOME_BONUS_ACU,
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

test('the organiser is charged nothing by default', () => {
  // Was 5% + 50p. The platform now takes no commission at all and pays the organiser
  // 100% of face value; all standard revenue is the buyer-side fee in `fees.ts`.
  assert.equal(terms.percent, DEFAULT_COMMISSION_PERCENT);
  assert.equal(terms.adminFee, DEFAULT_ADMIN_FEE);
  assert.equal(terms.percent, 0);
  assert.equal(terms.adminFee, 0);
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

test('a paid ticket costs the organiser nothing either', () => {
  // The whole promise, as one assertion: £20 in, £20 out.
  assert.equal(pennies(platformCutForTicket(20, terms)), 0);
});

test('a settlement pays out every penny of gross', () => {
  const lines = [{ price: 0 }, { price: 0 }, { price: 20 }];
  const result = settle(lines, terms);
  assert.equal(pennies(result.gross), 2000);
  assert.equal(pennies(result.commission), 0);
  assert.equal(pennies(result.adminFees), 0);
  assert.equal(pennies(result.platformTotal), 0);
  assert.equal(pennies(result.net), 2000, 'net must equal gross — that is the promise');
});

test('the free-ticket rule still holds under a bespoke agreement', () => {
  // The 0% default is not what protects a free ticket. A superuser can still negotiate
  // a rate, and a £0 guest list must cost nothing under that rate too — this is the
  // regression that once charged a 300-place wedding list £150.
  const bespoke = commissionTermsFor({ commissionPercent: 5, adminFee: 0.5 });
  const result = settle([{ price: 0 }, { price: 0 }, { price: 20 }], bespoke);
  assert.equal(pennies(result.adminFees), 50, 'one paid ticket, one admin fee');
  assert.equal(pennies(result.platformTotal), 150);
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
  // Nothing to charge at the 0% default, so the distinction is asserted where it still
  // has an effect: under a negotiated rate, £1 is charged and £0 is not.
  const bespoke = commissionTermsFor({ commissionPercent: 5, adminFee: 0.5 });
  assert.equal(pennies(platformCutForTicket(1, bespoke)), 55); // 5p + 50p
  assert.equal(pennies(platformCutForTicket(0, bespoke)), 0);
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

test('held seats reduce what is available to sell', () => {
  assert.equal(availableInTier({ quantity: 100, sold: 10, held: 5 }), 85);
  assert.equal(availableInTier({ quantity: 100 }), 100);
});

/* -------------------------------------------------------------------------- */
/* Pay what you want                                                          */
/* -------------------------------------------------------------------------- */

test('a fixed tier ignores whatever the browser posts', () => {
  // The hole this closes on every other tier: a crafted POST naming its own price.
  assert.equal(resolveLinePrice({ price: 250, pricing: 'fixed' }, 0.01), 250);
  assert.equal(resolveLinePrice({ price: 250 }, 0.01), 250);
  assert.equal(resolveLinePrice({ price: 250 }, 9_999), 250);
});

test('a choose tier takes the amount the giver named', () => {
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 5 }, 40), 40);
});

test('a choose tier never goes below the floor the organiser set', () => {
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 5 }, 1), 5);
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 5 }, -100), 5);
});

test('a floor of zero really does allow nothing', () => {
  // A free-entry collection where giving is optional is a real thing a church runs.
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 0 }, 0), 0);
});

test('a missing, empty or nonsense amount falls back to the floor, never to free', () => {
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 12 }, undefined), 12);
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 12 }, NaN), 12);
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose', minPrice: 12 }, Infinity), 12);
});

test('a fat-fingered amount is capped rather than sent to the card', () => {
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose' }, 5_000_000), CHOSEN_PRICE_CEILING);
});

test('the amount charged is rounded to the penny, not to the provider’s taste', () => {
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose' }, 33.333), 33.33);
  assert.equal(resolveLinePrice({ price: 0, pricing: 'choose' }, 33.335), 33.34);
});

test('a hidden tier never sets the public "from" price', () => {
  // A partner rate cheaper than general admission would otherwise advertise a number
  // nobody without the code can pay, and leak the discount at the same time.
  const event = {
    ticketTiers: [
      { id: 'ga', name: 'General', price: 40, quantity: 100 },
      { id: 'partner', name: 'Partner', price: 10, quantity: 20, visibility: 'hidden' as const },
    ],
  };
  assert.equal(leadPrice(event), 40);
});

test('an event with nothing but hidden tiers advertises no price at all', () => {
  const event = {
    ticketTiers: [
      { id: 'invite', name: 'Invite only', price: 75, quantity: 20, visibility: 'hidden' as const },
    ],
  };
  assert.equal(leadPrice(event), 0);
});

/* -------------------------------------------------------------------------- */
/* Sales windows                                                              */
/* -------------------------------------------------------------------------- */

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

test('a tier with no window is on sale, which is every tier that already exists', () => {
  assert.equal(tierSaleWindow({}, NOW).onSale, true);
});

test('a presale that has not opened is refused, and says when it does', () => {
  const window = tierSaleWindow({ salesStart: '2026-06-20T09:00:00.000Z' }, NOW);
  assert.equal(window.onSale, false);
  assert.ok(!window.onSale && window.reason === 'not-yet');
  assert.ok(!window.onSale && window.opensAt === '2026-06-20T09:00:00.000Z');
});

test('an early bird that has closed is refused', () => {
  const window = tierSaleWindow({ salesEnd: '2026-06-01T09:00:00.000Z' }, NOW);
  assert.ok(!window.onSale && window.reason === 'closed');
});

test('a tier inside both ends is on sale', () => {
  assert.equal(
    tierSaleWindow({ salesStart: '2026-06-01T00:00:00.000Z', salesEnd: '2026-07-01T00:00:00.000Z' }, NOW)
      .onSale,
    true
  );
});

test('an unparseable date never closes a tier by accident', () => {
  // Bad data must not silently take a tier off sale mid-event.
  assert.equal(tierSaleWindow({ salesStart: 'not a date', salesEnd: 'nonsense' }, NOW).onSale, true);
});

test('a closed early bird stops setting the public "from" price', () => {
  const event = {
    ticketTiers: [
      { id: 'early', name: 'Early bird', price: 15, quantity: 50, salesEnd: '2026-06-01T00:00:00.000Z' },
      { id: 'ga', name: 'General', price: 40, quantity: 100 },
    ],
  };
  assert.equal(leadPrice(event, NOW), 40);
});

/* ------------------------- attendee-type mixes (docs/23) ------------------ */

const MIXED_TIER = {
  attendeeTypes: [
    { id: 'adult', name: 'Adult', price: 10 },
    { id: 'child', name: 'Child', price: 5 },
    { id: 'student', name: 'Student', price: 7 },
  ],
};

test('an adult and a child price from the tier, never from the request', () => {
  const result = resolveMix(MIXED_TIER, [
    { typeId: 'adult', quantity: 1 },
    // A hostile request cannot smuggle a price — there is nowhere to put one.
    { typeId: 'child', quantity: 1 },
  ]);
  assert.ok(result.ok);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.entries.map((e) => [e.typeName, e.price]),
    [['Adult', 10], ['Child', 5]]
  );
});

test('an unknown type refuses the whole mix rather than dropping the line', () => {
  const result = resolveMix(MIXED_TIER, [
    { typeId: 'adult', quantity: 1 },
    { typeId: 'senior', quantity: 1 },
  ]);
  assert.equal(result.ok, false);
});

test('a tier without attendee types accepts no mix', () => {
  assert.equal(resolveMix({}, [{ typeId: 'adult', quantity: 1 }]).ok, false);
});

test('zero and rubbish quantities cannot make an empty order', () => {
  const result = resolveMix(MIXED_TIER, [
    { typeId: 'adult', quantity: 0 },
    { typeId: 'child', quantity: 'lots' },
  ]);
  assert.equal(result.ok, false);
});

test('quantities are capped, not trusted', () => {
  const result = resolveMix(MIXED_TIER, [{ typeId: 'child', quantity: 5000 }]);
  assert.ok(result.ok);
  assert.equal(result.total, 10);
});

test('expandMix pairs the i-th person with the i-th seat, in order', () => {
  const resolved = resolveMix(MIXED_TIER, [
    { typeId: 'adult', quantity: 2 },
    { typeId: 'child', quantity: 1 },
  ]);
  assert.ok(resolved.ok);
  const perTicket = expandMix(resolved.entries);
  assert.deepEqual(
    perTicket.map((t) => t.typeName),
    ['Adult', 'Adult', 'Child']
  );
  assert.equal(perTicket[2].price, 5);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
