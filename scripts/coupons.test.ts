/**
 * Coupon redemption settlement, against the Firestore emulator. `npm run test:coupons`
 *
 * The leak these pin: a coupon's `usageCount` was checked at checkout but never
 * incremented, so every code — a single-use one included — worked forever. Redemption is
 * now settled off the paid cart order, and the assertions are the two that make a usage
 * limit real: a paid order counts the coupon exactly once, and a redelivered webhook
 * (settling the same order again) does NOT count it a second time.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

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

let db: Firestore;
let coupons: typeof import('../src/backend/services/coupons');

async function clear() {
  for (const c of ['cart_orders', 'coupons']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  if (!admin.isAdminConfigured()) throw new Error('Admin SDK unconfigured — tests would prove nothing.');
  db = admin.getAdminDb();
  coupons = await import('../src/backend/services/coupons');

  console.log('\nCoupon redemption settlement (Firestore emulator)\n');

  await test('a paid order flips to issued and counts its coupon once', async () => {
    await clear();
    await db.collection('coupons').doc('c1').set({ code: 'SAVE', usageCount: 0, usageLimit: 1 });
    await db.collection('cart_orders').doc('o1').set({ status: 'pending', couponId: 'c1', lines: [{}] });

    const r = await coupons.settleCartOrderRedemption('o1');
    assert.equal(r, 'issued');
    assert.equal((await db.collection('cart_orders').doc('o1').get()).data()?.status, 'issued');
    assert.equal((await db.collection('coupons').doc('c1').get()).data()?.usageCount, 1);
  });

  await test('a redelivered webhook does not count the coupon again', async () => {
    // Same order settled a second time — the status transition already happened, so the
    // usage count must hold at 1, not creep to 2 on every retry.
    const again = await coupons.settleCartOrderRedemption('o1');
    assert.equal(again, 'already');
    assert.equal((await db.collection('coupons').doc('c1').get()).data()?.usageCount, 1);
  });

  await test('an order with no coupon still settles cleanly', async () => {
    await clear();
    await db.collection('cart_orders').doc('o2').set({ status: 'pending', lines: [{}] });
    assert.equal(await coupons.settleCartOrderRedemption('o2'), 'issued');
    assert.equal((await db.collection('cart_orders').doc('o2').get()).data()?.status, 'issued');
  });

  await test('a coupon deleted before payment is skipped, order still issues', async () => {
    await clear();
    await db.collection('cart_orders').doc('o3').set({ status: 'pending', couponId: 'gone', lines: [{}] });
    assert.equal(await coupons.settleCartOrderRedemption('o3'), 'issued');
    assert.equal((await db.collection('cart_orders').doc('o3').get()).data()?.status, 'issued');
  });

  await clear();

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
