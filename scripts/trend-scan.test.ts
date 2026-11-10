/**
 * Trend scan against the Firestore emulator. `npm run test:trend-scan`
 *
 * Proves the invisible server-side path: seeded first-party sales (a spike in one
 * category over a stable baseline) become weekly observations and one opportunity
 * snapshot; the snapshot is 'watch' (single family, never live); and a re-run is
 * idempotent — the same windows overwrite rather than inflate.
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
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-09T00:00:00Z');
let db: Firestore;
let svc: typeof import('../src/backend/trend/trend-scan');

async function clear(collection: string) {
  const snap = await db.collection(collection).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function seed() {
  for (const c of ['events', 'tickets', 'observations', 'opportunity_snapshots']) await clear(c);
  await db.collection('events').doc('e1').set({ category: 'music', country: 'GB', title: 'Gig' });
  const tickets: { eventId: string; purchasedAt: string; status: string }[] = [];
  const add = (startMs: number, n: number, status = 'valid') => {
    for (let i = 0; i < n; i += 1) {
      tickets.push({ eventId: 'e1', purchasedAt: new Date(startMs + 60_000 + i * 1000).toISOString(), status });
    }
  };
  add(NOW - WEEK, 40); // current complete week — the spike
  [10, 11, 9, 10, 10, 12, 8, 10].forEach((n, idx) => add(NOW - WEEK * (idx + 2), n)); // baseline
  add(NOW - WEEK, 5, 'refunded'); // must not count
  let i = 0;
  for (const t of tickets) await db.collection('tickets').doc(`t${i++}`).set(t);
}

async function run() {
  db = (await import('../src/backend/firebase/admin')).getAdminDb();
  svc = await import('../src/backend/trend/trend-scan');

  console.log('\nTrend scan (Firestore emulator)\n');

  await test('a sales spike produces observations and a watch-level snapshot', async () => {
    await seed();
    const result = await svc.runTrendScan(NOW);
    assert.ok(result.observations >= 9, `expected ≥9 observations, got ${result.observations}`);
    assert.ok(result.snapshots >= 1, `expected ≥1 snapshot, got ${result.snapshots}`);

    const snap = await db.collection('opportunity_snapshots').doc('music__GB').get();
    assert.ok(snap.exists, 'snapshot written for music__GB');
    const d = snap.data()!;
    assert.equal(d.anomaly_status, 'passed');
    assert.ok((d.demand as number) > 75, `demand high, got ${d.demand}`);
    assert.ok((d.confidence as number) <= 69, 'single family capped at 69');
    assert.equal(d.decision, 'watch', 'never live on a single source family');
  });

  await test('the current-week observation counts 40 (refunds excluded)', async () => {
    const snap = await db
      .collection('observations')
      .where('topic', '==', 'music')
      .where('window_end', '==', new Date(NOW).toISOString())
      .get();
    assert.equal(snap.size, 1);
    assert.equal(snap.docs[0].data().value, 40);
  });

  await test('a re-run is idempotent (same window overwrites, no inflation)', async () => {
    const before = (await db.collection('observations').get()).size;
    await svc.runTrendScan(NOW);
    const after = (await db.collection('observations').get()).size;
    assert.equal(after, before, 'observation doc count is stable across runs');
    const current = await db
      .collection('observations')
      .where('window_end', '==', new Date(NOW).toISOString())
      .get();
    assert.equal(current.docs[0].data().value, 40, 'count not doubled by the second run');
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
