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

import { payoutKey, sumWhiteLabelPayable, type PayableEvent } from './settlement';

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

console.log('\nSettlement — white-label payable\n');

const issue = (over: Partial<PayableEvent>): PayableEvent => ({
  intent: 'issue',
  provider: 'stripe',
  providerRef: 'pi_1',
  feeSnapshot: { organiserPayoutMinor: 2000, faceMinor: 2000 },
  ...over,
});

test('white-label: pays the recorded organiser payout, not face', () => {
  // A £20 face ticket whose white-label payout is £20.48 (fan paid the booking fee on top).
  const owed = sumWhiteLabelPayable([
    issue({ providerRef: 'pi_a', feeSnapshot: { organiserPayoutMinor: 2048, faceMinor: 2000 } }),
  ]);
  assert.equal(owed, 2048);
});

test('white-label: an absorbed fee pays below face', () => {
  const owed = sumWhiteLabelPayable([
    issue({ providerRef: 'pi_b', feeSnapshot: { organiserPayoutMinor: 1910, faceMinor: 2000 } }),
  ]);
  assert.equal(owed, 1910);
});

test('white-label: a refunded order is netted out', () => {
  const owed = sumWhiteLabelPayable([
    issue({ providerRef: 'pi_keep', feeSnapshot: { organiserPayoutMinor: 2048, faceMinor: 2000 } }),
    issue({ providerRef: 'pi_gone', feeSnapshot: { organiserPayoutMinor: 2048, faceMinor: 2000 } }),
    { intent: 'refund', provider: 'stripe', refundsRef: 'pi_gone' },
  ]);
  assert.equal(owed, 2048);
});

test('white-label: box-office and free are excluded', () => {
  const owed = sumWhiteLabelPayable([
    issue({ providerRef: 'pi_card', feeSnapshot: { organiserPayoutMinor: 2048, faceMinor: 2000 } }),
    issue({ provider: 'offline', providerRef: 'bo_1', feeSnapshot: { organiserPayoutMinor: 3000, faceMinor: 3000 } }),
    issue({ provider: 'free', providerRef: 'fr_1', feeSnapshot: { organiserPayoutMinor: 0, faceMinor: 0 } }),
  ]);
  assert.equal(owed, 2048);
});

test('white-label: a snapshot without a payout field falls back to face', () => {
  const owed = sumWhiteLabelPayable([
    issue({ providerRef: 'pi_old', feeSnapshot: { faceMinor: 1500 } }),
  ]);
  assert.equal(owed, 1500);
});

test('white-label: an event with no fee snapshot is skipped, not guessed', () => {
  const owed = sumWhiteLabelPayable([{ intent: 'issue', provider: 'stripe', providerRef: 'pi_x' }]);
  assert.equal(owed, 0);
});

test('white-label: mobile-money (bitripay) payouts count', () => {
  const owed = sumWhiteLabelPayable([
    issue({ provider: 'bitripay', providerRef: 'ko_1', feeSnapshot: { organiserPayoutMinor: 500, faceMinor: 500 } }),
  ]);
  assert.equal(owed, 500);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
