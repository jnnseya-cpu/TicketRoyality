/**
 * Checkout hold tests, against the Firestore emulator. `npm run test:holds`
 *
 * The point of holds is not that issuance stops an oversell — it always did, and
 * `payment-loop.test.ts` proves it. The point is *where* the second buyer is refused.
 * Without a hold they are refused after paying, and somebody has to notice and refund
 * them by hand. With one they are refused before entering a card, which is the only
 * place saying no costs nothing.
 *
 * So the assertions here are about the state of the tier at the moment a second checkout
 * starts, and about the counter never drifting — a `held` that leaks upward silently
 * sells out a live event, and one that leaks downward oversells it.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import type { TicketTier } from '../src/shared/types';

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const EVENT = 'event-holds';
let db: Firestore;
let holds: typeof import('../src/backend/services/holds');

async function seedTier(quantity: number, sold = 0, held = 0) {
  await db.collection('events').doc(EVENT).set({
    title: 'Holds Test',
    organizerId: 'org-1',
    ticketTiers: [{ id: 'tier-1', name: 'General', price: 25, quantity, sold, held }],
  });
}

async function tier(): Promise<TicketTier> {
  const snap = await db.collection('events').doc(EVENT).get();
  return (snap.data()?.ticketTiers as TicketTier[])[0];
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  if (!admin.isAdminConfigured()) throw new Error('Admin SDK unconfigured — tests would prove nothing.');
  db = admin.getAdminDb();
  holds = await import('../src/backend/services/holds');

  for (const c of ['events', 'checkout_holds']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  console.log('\nCheckout holds (Firestore emulator)\n');

  await test('a hold reserves inventory without touching quantity or sold', async () => {
    await seedTier(10);
    const result = await holds.placeHold(EVENT, 'tier-1', 2);
    assert.equal(result.ok, true);
    const t = await tier();
    assert.equal(t.held, 2);
    assert.equal(t.sold ?? 0, 0, 'a hold is not a sale');
    assert.equal(t.quantity, 10, 'quantity is the organiser’s number and must not move');
  });

  await test('the second buyer for the last seat is refused before paying', async () => {
    // The whole reason this exists. Without a hold both reach Stripe and both are
    // charged; the loser is then owed a manual refund.
    await seedTier(1);
    const first = await holds.placeHold(EVENT, 'tier-1', 1);
    const second = await holds.placeHold(EVENT, 'tier-1', 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, 'sold-out');
  });

  await test('two simultaneous checkouts for one seat: exactly one holds it', async () => {
    await seedTier(1);
    const [a, b] = await Promise.all([
      holds.placeHold(EVENT, 'tier-1', 1),
      holds.placeHold(EVENT, 'tier-1', 1),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal((await tier()).held, 1, 'held must never exceed what exists');
  });

  await test('a partial shortfall says how many are actually left', async () => {
    await seedTier(5, 0, 3);
    const result = await holds.placeHold(EVENT, 'tier-1', 3);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Only 2 left/);
  });

  await test('an abandoned checkout gives the seat back', async () => {
    await seedTier(1);
    const held = await holds.placeHold(EVENT, 'tier-1', 1);
    assert.equal(held.ok, true);
    if (!held.ok) return;

    assert.equal(await holds.releaseHold(held.holdId, 'abandoned'), true);
    assert.equal((await tier()).held, 0);

    // And the seat is genuinely sellable again, not merely counted as free.
    assert.equal((await holds.placeHold(EVENT, 'tier-1', 1)).ok, true);
  });

  await test('releasing twice does not credit the tier twice', async () => {
    // A sweep and a cancelled checkout can land at the same moment. Double-crediting
    // `held` would let the tier oversell in the opposite direction.
    await seedTier(5);
    const held = await holds.placeHold(EVENT, 'tier-1', 2);
    if (!held.ok) throw new Error('setup failed');

    assert.equal(await holds.releaseHold(held.holdId), true);
    assert.equal(await holds.releaseHold(held.holdId), false, 'the second release is a no-op');
    assert.equal((await tier()).held, 0);
  });

  await test('the sweep releases expired holds and leaves live ones alone', async () => {
    await seedTier(10);
    const live = await holds.placeHold(EVENT, 'tier-1', 1);
    const stale = await holds.placeHold(EVENT, 'tier-1', 2);
    if (!live.ok || !stale.ok) throw new Error('setup failed');

    // Backdate one past its window.
    await db.collection('checkout_holds').doc(stale.holdId).update({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const released = await holds.expireHolds();
    assert.equal(released, 1);
    assert.equal((await tier()).held, 1, 'the live hold must survive the sweep');
  });

  await test('the sweep is safe to run repeatedly', async () => {
    // Cron overlap is normal. A second pass must find nothing to do.
    assert.equal(await holds.expireHolds(), 0);
  });

  await test('a hold on a tier that no longer exists is refused, not silently ignored', async () => {
    await seedTier(10);
    const result = await holds.placeHold(EVENT, 'tier-gone', 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-tier');
  });

  await test('a hold on a deleted event is refused', async () => {
    const result = await holds.placeHold('event-deleted', 'tier-1', 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-event');
  });

  await test('held inventory is invisible to the organiser’s sold count', async () => {
    // An organiser looking at their dashboard mid-rush must not see holds as revenue.
    await seedTier(10, 3);
    await holds.placeHold(EVENT, 'tier-1', 4);
    const t = await tier();
    assert.equal(t.sold, 3);
    assert.equal(t.held, 4);
    assert.equal(t.quantity - (t.sold ?? 0) - (t.held ?? 0), 3, 'three genuinely sellable');
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
