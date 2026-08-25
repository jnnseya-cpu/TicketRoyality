/**
 * AI usage cap + spend recording, against the Firestore emulator. `npm run test:ai-usage`
 *
 * The point of this module is that `/api/ai` — which fronts three paid model providers —
 * can never again be an open, unmetered proxy to paid inference. The route now proves who
 * is calling and counts every call against a hard per-user daily cap BEFORE any provider
 * is touched. These assertions pin the two things that make that a real ceiling and not a
 * comment: the (n+1)th call in a day is refused, and the refusal does NOT consume a
 * provider call; and the running spend the reconciler will read is the sum of what each
 * call actually cost.
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
let usage: typeof import('../src/backend/services/ai-usage');

async function clearUsage() {
  const snap = await db.collection('ai_usage').get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  if (!admin.isAdminConfigured()) throw new Error('Admin SDK unconfigured — tests would prove nothing.');
  db = admin.getAdminDb();
  usage = await import('../src/backend/services/ai-usage');

  console.log('\nAI usage cap + spend (Firestore emulator)\n');

  await test('a fresh account may call, and each call is counted', async () => {
    await clearUsage();
    const first = await usage.reserveAiCall('user-a');
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.used, 1);
    const second = await usage.reserveAiCall('user-a');
    if (second.ok) assert.equal(second.used, 2, 'the counter advances per call');
  });

  await test('the call past the daily cap is refused, and refusal spends nothing', async () => {
    await clearUsage();
    // Pre-seed the day at the cap so the very next call is the (cap+1)th.
    const today = new Date().toISOString().slice(0, 10);
    await db
      .collection('ai_usage')
      .doc(`user-b__${today}`)
      .set({ uid: 'user-b', day: today, calls: usage.AI_DAILY_CALL_CAP });

    const refused = await usage.reserveAiCall('user-b');
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.reason, 'over_cap');

    // The refusal must not have advanced the counter — otherwise a refused caller still
    // moved state, and a provider was never contacted, so nothing legitimately did.
    const after = (await db.collection('ai_usage').doc(`user-b__${today}`).get()).data();
    assert.equal(Number(after?.calls), usage.AI_DAILY_CALL_CAP, 'a refused call is not counted again');
  });

  await test("one account's cap does not touch another's", async () => {
    await clearUsage();
    const today = new Date().toISOString().slice(0, 10);
    await db
      .collection('ai_usage')
      .doc(`user-c__${today}`)
      .set({ uid: 'user-c', day: today, calls: usage.AI_DAILY_CALL_CAP });

    assert.equal((await usage.reserveAiCall('user-c')).ok, false, 'c is capped');
    assert.equal((await usage.reserveAiCall('user-d')).ok, true, 'd is untouched');
  });

  await test('recorded spend accumulates the real provider cost and user charge', async () => {
    await clearUsage();
    await usage.reserveAiCall('user-e');
    await usage.recordAiSpend('user-e', {
      providerCostUsd: 0.002,
      markupMultiplier: 4,
      userChargeUsd: 0.008,
      acu: 1,
    });
    await usage.recordAiSpend('user-e', {
      providerCostUsd: 0.003,
      markupMultiplier: 4,
      userChargeUsd: 0.012,
      acu: 2,
    });

    const today = new Date().toISOString().slice(0, 10);
    const doc = (await db.collection('ai_usage').doc(`user-e__${today}`).get()).data();
    assert.ok(Math.abs(Number(doc?.providerCostUsd) - 0.005) < 1e-9, 'provider cost sums');
    assert.ok(Math.abs(Number(doc?.userChargeUsd) - 0.02) < 1e-9, 'user charge sums');
    assert.equal(Number(doc?.acu), 3, 'ACU sums');
  });

  await clearUsage();

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
