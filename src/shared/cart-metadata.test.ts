/**
 * The basket's ride through Stripe metadata. `npm run test:cart-metadata`
 *
 * The assertions that matter are the ones that stop a paid basket issuing the wrong
 * thing: a round trip must reproduce every line exactly, an oversized basket must be
 * refused rather than truncated, and garbage from the metadata must decode to an empty
 * list the webhook can log — never a throw that loses a payment already taken.
 */
import assert from 'node:assert/strict';

import { decodeCart, encodeCart, type CartItemMeta } from './cart-metadata';

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

const item = (over: Partial<CartItemMeta> = {}): CartItemMeta => ({
  eventId: 'evt_abc123',
  tierId: 'tier_1',
  quantity: 2,
  unitMajor: 10,
  ...over,
});

console.log('\nCart metadata\n');

test('a basket round-trips exactly', () => {
  const items = [
    item(),
    item({ tierId: 'tier_vip', quantity: 1, unitMajor: 25.5 }),
    item({ eventId: 'evt_other', tierId: 'tier_ga', quantity: 3, unitMajor: 7.99 }),
  ];
  const encoded = encodeCart(items);
  assert.ok(encoded.ok);
  assert.deepEqual(decodeCart(encoded.value), items);
});

test('post-coupon penny prices survive the trip', () => {
  const encoded = encodeCart([item({ unitMajor: 9.01 })]);
  assert.ok(encoded.ok);
  assert.equal(decodeCart(encoded.value)[0].unitMajor, 9.01);
});

test('the encoded value fits Stripe metadata', () => {
  const encoded = encodeCart([item(), item({ tierId: 'tier_2' })]);
  assert.ok(encoded.ok);
  assert.ok(encoded.value.length <= 500);
});

test('a basket too big to fit is refused, never truncated', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    item({ eventId: `evt_long_identifier_${i}`, tierId: `tier_long_identifier_${i}` })
  );
  const encoded = encodeCart(many);
  assert.equal(encoded.ok, false);
});

test('absent metadata decodes to an empty basket', () => {
  assert.deepEqual(decodeCart(undefined), []);
  assert.deepEqual(decodeCart(''), []);
});

test('garbage decodes to an empty basket, never a throw', () => {
  assert.deepEqual(decodeCart('not json at all'), []);
  assert.deepEqual(decodeCart('{"an":"object"}'), []);
  assert.deepEqual(decodeCart('42'), []);
});

test('rows missing ids are dropped; valid rows survive', () => {
  const mixed = JSON.stringify([
    ['evt_1', 'tier_1', 2, 10],
    [null, 'tier_2', 1, 5],
    'nonsense',
  ]);
  const decoded = decodeCart(mixed);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].eventId, 'evt_1');
});

test('a corrupt quantity clamps to one, a corrupt price to zero', () => {
  const decoded = decodeCart(JSON.stringify([['evt_1', 'tier_1', -3, -8]]));
  assert.equal(decoded[0].quantity, 1);
  assert.equal(decoded[0].unitMajor, 0);
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
