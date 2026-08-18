/**
 * Gift Aid arithmetic and eligibility. `npm run test:gift-aid`
 *
 * The assertions that matter are the ones that stop money being claimed that cannot be
 * claimed: never a penny over the entitlement, never on a ticket, never without a
 * declaration, and never where the donor got too much back for it to be a gift.
 */
import assert from 'node:assert/strict';

import {
  benefitLimitMinor,
  checkDeclaration,
  claimCsv,
  giftAidOnMinor,
  ineligibility,
  normalisePostcode,
  summariseClaim,
  type ClaimableDonation,
} from './gift-aid';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const declaration = (over: Partial<NonNullable<ClaimableDonation['declaration']>> = {}) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  addressLine: '12',
  postcode: 'SW1A 1AA',
  madeAt: '2026-01-10T10:00:00.000Z',
  enduring: true,
  ...over,
});

const donation = (over: Partial<ClaimableDonation> = {}): ClaimableDonation => ({
  id: 'd-1',
  donatedAt: '2026-02-01',
  amountMinor: 10_000,
  declaration: declaration(),
  ...over,
});

console.log('\nGift Aid\n');

/* -------------------------------------------------------------------- */
/* The reclaim                                                          */
/* -------------------------------------------------------------------- */

test('a £10 gift reclaims £2.50', () => {
  assert.equal(giftAidOnMinor(1000), 250);
});

test('the reclaim is rounded down, never up', () => {
  /*
   * £0.13 → 3.25p. Claiming 4p is claiming money the charity is not entitled to, and it
   * is the kind of error that is only found in an audit of a year of claims.
   */
  assert.equal(giftAidOnMinor(13), 3);
  assert.equal(giftAidOnMinor(7), 1);
  assert.equal(giftAidOnMinor(3), 0);
});

test('nothing is reclaimed on nothing', () => {
  assert.equal(giftAidOnMinor(0), 0);
  assert.equal(giftAidOnMinor(-500), 0);
});

test('the total is the sum of per-donation reclaims, not a reclaim on the total', () => {
  // Four 13p gifts: 3p each = 12p. On the total (52p) it would be 13p — a penny that
  // reconciles to no donation and cannot be explained to an inspector.
  const donations = Array.from({ length: 4 }, (_, i) =>
    donation({ id: `d-${i}`, amountMinor: 13 })
  );
  assert.equal(summariseClaim(donations).reclaimMinor, 12);
});

/* -------------------------------------------------------------------- */
/* Benefits — where a donation stops being a donation                   */
/* -------------------------------------------------------------------- */

test('up to £100, a benefit may be a quarter of the gift', () => {
  assert.equal(benefitLimitMinor(10_000), 2_500);
  assert.equal(benefitLimitMinor(4_000), 1_000);
});

test('above £100 the limit is £25 plus 5% of the excess', () => {
  // £1,000 → £25 + 5% of £900 = £70
  assert.equal(benefitLimitMinor(100_000), 7_000);
});

test('no benefit may exceed £2,500 however large the gift', () => {
  assert.equal(benefitLimitMinor(100_000_00), 250_000);
});

test('a gift where the donor got too much back cannot be claimed', () => {
  // The gala dinner case: £100 "donation", £60 of food. That is not a gift.
  const meal = donation({ amountMinor: 10_000, benefitMinor: 6_000 });
  assert.equal(ineligibility(meal), 'benefit-too-large');
});

test('a benefit inside the limit is fine', () => {
  assert.equal(ineligibility(donation({ amountMinor: 10_000, benefitMinor: 2_500 })), null);
});

/* -------------------------------------------------------------------- */
/* Declarations                                                         */
/* -------------------------------------------------------------------- */

test('no declaration means no claim', () => {
  assert.equal(ineligibility(donation({ declaration: null })), 'no-declaration');
});

test('an enduring declaration reaches back four years', () => {
  const old = donation({
    donatedAt: '2023-06-01',
    declaration: declaration({ madeAt: '2026-01-10T10:00:00.000Z', enduring: true }),
  });
  assert.equal(ineligibility(old), null);
});

test('an enduring declaration does not reach back five', () => {
  const tooOld = donation({
    donatedAt: '2021-06-01',
    declaration: declaration({ madeAt: '2026-01-10T10:00:00.000Z', enduring: true }),
  });
  assert.equal(ineligibility(tooOld), 'before-declaration');
});

test('a one-off declaration covers nothing earlier than itself', () => {
  const earlier = donation({
    donatedAt: '2025-12-01',
    declaration: declaration({ madeAt: '2026-01-10T10:00:00.000Z', enduring: false }),
  });
  assert.equal(ineligibility(earlier), 'before-declaration');
});

test('a declaration needs a name, an address and the taxpayer confirmation', () => {
  assert.deepEqual(
    checkDeclaration({
      firstName: '',
      lastName: '',
      addressLine: '',
      postcode: 'nonsense',
      confirmedTaxpayer: false,
    }).sort(),
    ['bad-postcode', 'no-address', 'no-first-name', 'no-last-name', 'not-confirmed']
  );
});

test('a complete declaration has no problems', () => {
  assert.deepEqual(
    checkDeclaration({
      firstName: 'Ada',
      lastName: 'Lovelace',
      addressLine: '12 Marylebone',
      postcode: 'sw1a1aa',
      confirmedTaxpayer: true,
    }),
    []
  );
});

test('a real postcode is not rejected because of how it was typed', () => {
  // Losing a declaration to a fussy validator loses the claim with it.
  assert.equal(normalisePostcode('sw1a1aa'), 'SW1A 1AA');
  assert.equal(normalisePostcode('  ec1v   9nr '), 'EC1V 9NR');
  assert.equal(normalisePostcode('M11AE'), 'M1 1AE');
});

/* -------------------------------------------------------------------- */
/* The claim                                                            */
/* -------------------------------------------------------------------- */

test('the summary says what cannot be claimed and why', () => {
  const summary = summariseClaim([
    donation({ id: 'a', amountMinor: 10_000 }),
    donation({ id: 'b', amountMinor: 5_000, declaration: null }),
    donation({ id: 'c', amountMinor: 20_000, benefitMinor: 15_000 }),
  ]);

  assert.equal(summary.count, 1);
  assert.equal(summary.claimableMinor, 10_000);
  assert.equal(summary.reclaimMinor, 2_500);
  assert.deepEqual(summary.excluded['no-declaration'], { count: 1, amountMinor: 5_000 });
  assert.deepEqual(summary.excluded['benefit-too-large'], { count: 1, amountMinor: 20_000 });
});

test('the schedule carries the donor details HMRC matches on', () => {
  const csv = claimCsv([donation({ donatedAt: '2026-02-03T12:00:00.000Z' })]);
  const [header, row] = csv.split('\n');

  assert.equal(header.startsWith('Title,First name,Last name,House name or number,Postcode'), true);
  assert.equal(row.includes('Ada'), true);
  assert.equal(row.includes('SW1A 1AA'), true);
  // DD/MM/YY, which is the schedule's format and not this codebase's usual ISO.
  assert.equal(row.includes('03/02/26'), true);
  assert.equal(row.endsWith('100.00'), true);
});

test('an unclaimable donation never reaches the schedule', () => {
  const csv = claimCsv([
    donation({ id: 'ok' }),
    donation({ id: 'no', declaration: null }),
  ]);
  assert.equal(csv.split('\n').length, 2, 'header plus one row');
});

test('a comma in a donor’s address does not shift every later column', () => {
  const csv = claimCsv([
    donation({ declaration: declaration({ addressLine: 'Flat 2, The Lodge' }) }),
  ]);
  assert.equal(csv.includes('"Flat 2, The Lodge"'), true);
});

console.log(`\n${passed}/${passed + failures.length} passed\n`);
if (failures.length > 0) process.exit(1);
