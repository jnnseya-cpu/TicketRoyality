/**
 * Automatic pricing against the Firestore emulator. `npm run test:auto-pricing-apply`
 *
 * The unit test (`test:auto-pricing`) pins the pure rule maths. This proves the Firestore
 * side: enabling captures baselines, a sweep applies the rule change atomically and logs
 * it, the minimum-gap guard stops a second immediate change, a clearance decrease fires
 * near the date, and an undo restores the previous price exactly.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import type { DynamicPricing, TicketTier } from '../src/shared/types';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const ORG = 'org-1';
let db: Firestore;
let svc: typeof import('../src/backend/services/dynamic-pricing');

async function seedEvent(id: string, tiers: TicketTier[], daysOut = 30) {
  await db
    .collection('events')
    .doc(id)
    .set({
      title: 'Test event',
      organizerId: ORG,
      date: new Date(Date.now() + daysOut * DAY).toISOString(),
      createdAt: new Date(Date.now() - 20 * DAY).toISOString(),
      ticketTiers: tiers,
    });
}
const tier = (over: Partial<TicketTier> = {}): TicketTier =>
  ({ id: 't1', name: 'General', price: 10, quantity: 100, sold: 0, ...over } as TicketTier);

async function dp(id: string): Promise<DynamicPricing> {
  const snap = await db.collection('events').doc(id).get();
  return (snap.data()?.dynamicPricing ?? {}) as DynamicPricing;
}
async function priceOf(id: string, tierId: string): Promise<number> {
  const snap = await db.collection('events').doc(id).get();
  return (snap.data()?.ticketTiers as TicketTier[]).find((t) => t.id === tierId)!.price;
}

async function run() {
  db = (await import('../src/backend/firebase/admin')).getAdminDb();
  svc = await import('../src/backend/services/dynamic-pricing');

  console.log('\nAutomatic pricing (Firestore emulator)\n');

  await test('enabling captures each tier price as its baseline', async () => {
    await seedEvent('e1', [tier({ price: 10 }), tier({ id: 't2', name: 'VIP', price: 40 })]);
    const r = await svc.setAutoPricing('e1', ORG, true);
    assert.equal(r.ok, true);
    const p = await dp('e1');
    assert.equal(p.auto, true);
    assert.equal(p.baselines?.t1, 10);
    assert.equal(p.baselines?.t2, 40);
  });

  await test('a sweep raises a scarce tier by 15% and logs it', async () => {
    await seedEvent('e2', [tier({ price: 10, quantity: 100, sold: 80 })]); // 20% left
    await svc.setAutoPricing('e2', ORG, true);
    const applied = await svc.runAutoPricingForEvent('e2');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].trigger, 'scarcity');
    assert.equal(await priceOf('e2', 't1'), 11.5);
    const p = await dp('e2');
    assert.equal(p.autoLog?.[0]?.toPrice, 11.5);
    assert.equal(p.autoLog?.[0]?.fromPrice, 10);
  });

  await test('the minimum-gap guard stops a second immediate change', async () => {
    const again = await svc.runAutoPricingForEvent('e2');
    assert.equal(again.length, 0, 'changed <24h ago — must be left alone');
    assert.equal(await priceOf('e2', 't1'), 11.5);
  });

  await test('an undo restores the previous price exactly', async () => {
    const r = await svc.revertAutoChange('e2', ORG, 't1');
    assert.equal(r.ok, true);
    assert.equal(await priceOf('e2', 't1'), 10);
    const p = await dp('e2');
    assert.equal(p.autoLog?.[0]?.reverted, true);
  });

  await test('an undo from the wrong organiser is refused', async () => {
    await seedEvent('e3', [tier({ price: 10, sold: 80 })]);
    await svc.setAutoPricing('e3', ORG, true);
    await svc.runAutoPricingForEvent('e3');
    const r = await svc.revertAutoChange('e3', 'someone-else', 't1');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
    assert.equal(await priceOf('e3', 't1'), 11.5, 'price must not move for a non-owner');
  });

  await test('slow sales within 14 days lower the price by 10%', async () => {
    await seedEvent('e4', [tier({ price: 10, quantity: 100, sold: 30 })], 10); // 10 days out
    await svc.setAutoPricing('e4', ORG, true);
    const applied = await svc.runAutoPricingForEvent('e4');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].trigger, 'slow_clearance');
    assert.equal(await priceOf('e4', 't1'), 9);
  });

  await test('disabling stops future changes', async () => {
    await svc.setAutoPricing('e4', ORG, false);
    assert.equal((await dp('e4')).auto, false);
    const applied = await svc.runAutoPricingForEvent('e4');
    assert.equal(applied.length, 0);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
