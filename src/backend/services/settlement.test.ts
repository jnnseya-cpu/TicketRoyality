/**
 * Settlement key tests. Run with: npm run test:settlement
 *
 * The one thing that must never break here is the idempotency key: the same debt derives
 * the same key (so a retry pays nothing again), a different period derives a different key
 * (so next month is genuinely payable), and the key is always a legal Firestore document id.
 * The transfers themselves need the emulator and a live Connect account; this pins the
 * arithmetic of *which* payout is *which*, which is where a double-pay would come from.
 */
import assert from 'node:assert/strict';

import { payoutKey } from './settlement';

const results: Array<[string, boolean]> = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([name, false]);
    console.error(`  ✗ ${name}\n      ${(error as Error).message.split('\n')[0]}`);
  }
}

console.log('\nSettlement — idempotency keys\n');

test('the same debt derives the same key', () => {
  const a = payoutKey('organiser', 'org123', 'organiser_event', 'evt789');
  const b = payoutKey('organiser', 'org123', 'organiser_event', 'evt789');
  assert.equal(a, b);
});

test('a different period is a different, payable key', () => {
  const jan = payoutKey('organiser', 'org123', 'monthly', '2026-01');
  const feb = payoutKey('organiser', 'org123', 'monthly', '2026-02');
  assert.notEqual(jan, feb);
});

test('a different party or reason never collides', () => {
  const promoter = payoutKey('promoter', 'CODE1', 'promoter_commission', 'evt789');
  const organiser = payoutKey('organiser', 'CODE1', 'promoter_commission', 'evt789');
  assert.notEqual(promoter, organiser);
});

test('the key is always a legal Firestore document id', () => {
  // Emails, slashes and spaces would otherwise break the doc path.
  const key = payoutKey('promoter', 'promoter@example.com', 'promoter_commission', 'a/b c');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(key), `illegal key: ${key}`);
  assert.ok(key.length <= 300);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
