/**
 * Venue zone tests, against the Firestore emulator. `npm run test:zones`
 *
 * The property under test that is easiest to get wrong: a zone scan must NOT consume the
 * ticket. Entering the hospitality lounge and coming back out is normal, and a model
 * that reused `redeemed` for zones would need a ticket to un-redeem itself every time
 * someone stepped outside — exactly the transition `firestore.rules` forbids, for good
 * reason. Zones are recorded separately and `status` is never touched.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import type { VenueZone } from '../src/shared/types';

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

const EVENT = 'event-zones';
let db: Firestore;
let zones: typeof import('../src/backend/services/zones');

const ZONES: VenueZone[] = [
  { id: 'gate', name: 'Main gate', allowedTierIds: [], capacity: null, reEntry: true, occupancy: 0 },
  { id: 'vip', name: 'VIP lounge', allowedTierIds: ['tier-vip'], capacity: 2, reEntry: true, occupancy: 0 },
  { id: 'dinner', name: 'Dinner sitting', allowedTierIds: ['tier-vip'], capacity: 10, reEntry: false, occupancy: 0 },
];

async function seed() {
  for (const c of ['events', 'tickets', 'zone_admissions']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection('events').doc(EVENT).set({ title: 'Zoned', organizerId: 'org-1', zones: ZONES });
}

async function ticket(id: string, tierId: string, status = 'valid') {
  await db.collection('tickets').doc(id).set({ eventId: EVENT, tierId, status, reference: id });
}

async function zone(id: string): Promise<VenueZone> {
  const snap = await db.collection('events').doc(EVENT).get();
  return (snap.data()?.zones as VenueZone[]).find((z) => z.id === id)!;
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  zones = await import('../src/backend/services/zones');

  console.log('\nVenue zones (Firestore emulator)\n');

  await test('a main gate with no allow-list admits every tier', async () => {
    await seed();
    await ticket('t-ga', 'tier-ga');
    const result = await zones.admitToZone('t-ga', EVENT, 'gate');
    assert.equal(result.ok, true);
  });

  await test('a zone refuses a tier it does not admit', async () => {
    // "Gates that admit only the ticket types assigned to them", as claimed.
    await seed();
    await ticket('t-ga', 'tier-ga');
    const result = await zones.admitToZone('t-ga', EVENT, 'vip');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'wrong-tier');
    assert.equal((await zone('vip')).occupancy ?? 0, 0, 'a refusal must not count as an entry');
  });

  await test('a zone admits the tier it is assigned', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    const result = await zones.admitToZone('t-vip', EVENT, 'vip');
    assert.equal(result.ok, true);
    assert.equal((await zone('vip')).occupancy, 1);
  });

  await test('a zone scan does NOT consume the ticket', async () => {
    // The property most easily broken. The holder is coming back out.
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'vip');
    const t = (await db.collection('tickets').doc('t-vip').get()).data();
    assert.equal(t?.status, 'valid', 'a zone entry must never redeem the ticket');
  });

  await test('a zone fills up and turns the next person away', async () => {
    await seed();
    for (const id of ['v1', 'v2', 'v3']) await ticket(id, 'tier-vip');
    assert.equal((await zones.admitToZone('v1', EVENT, 'vip')).ok, true);
    assert.equal((await zones.admitToZone('v2', EVENT, 'vip')).ok, true);

    const third = await zones.admitToZone('v3', EVENT, 'vip');
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.kind, 'zone-full');
    assert.equal((await zone('vip')).occupancy, 2, 'occupancy must not exceed capacity');
  });

  await test('two doors into a full-but-one zone admit exactly one', async () => {
    await seed();
    await db.collection('events').doc(EVENT).update({
      zones: ZONES.map((z) => (z.id === 'vip' ? { ...z, capacity: 1 } : z)),
    });
    await ticket('r1', 'tier-vip');
    await ticket('r2', 'tier-vip');

    const [a, b] = await Promise.all([
      zones.admitToZone('r1', EVENT, 'vip'),
      zones.admitToZone('r2', EVENT, 'vip'),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal((await zone('vip')).occupancy, 1);
  });

  await test('scanning in twice is refused — already inside', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'vip');
    const again = await zones.admitToZone('t-vip', EVENT, 'vip');
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.kind, 'no-reentry');
    assert.equal((await zone('vip')).occupancy, 1, 'a double scan must not double-count');
  });

  await test('leaving decrements occupancy', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'vip');
    const out = await zones.admitToZone('t-vip', EVENT, 'vip', 'out');
    assert.equal(out.ok, true);
    assert.equal((await zone('vip')).occupancy, 0);
  });

  await test('a re-entry zone lets someone back in', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'vip');
    await zones.admitToZone('t-vip', EVENT, 'vip', 'out');
    const back = await zones.admitToZone('t-vip', EVENT, 'vip');
    assert.equal(back.ok, true);
    assert.equal((await zone('vip')).occupancy, 1);
  });

  await test('a no-re-entry zone refuses a second entry', async () => {
    // A one-shot dinner sitting. Out is still allowed; back in is not.
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'dinner');
    await zones.admitToZone('t-vip', EVENT, 'dinner', 'out');
    const back = await zones.admitToZone('t-vip', EVENT, 'dinner');
    assert.equal(back.ok, false);
    if (!back.ok) assert.equal(back.kind, 'no-reentry');
  });

  await test('leaving a zone you were never in is refused', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    const out = await zones.admitToZone('t-vip', EVENT, 'vip', 'out');
    assert.equal(out.ok, false);
    assert.equal((await zone('vip')).occupancy ?? 0, 0, 'occupancy must never go negative');
  });

  await test('a refunded ticket cannot enter, even after an earlier entry', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    await zones.admitToZone('t-vip', EVENT, 'vip');
    await zones.admitToZone('t-vip', EVENT, 'vip', 'out');
    await db.collection('tickets').doc('t-vip').update({ status: 'refunded' });

    const result = await zones.admitToZone('t-vip', EVENT, 'vip');
    assert.equal(result.ok, false);
  });

  await test('a ticket for another event cannot enter', async () => {
    await seed();
    await db.collection('tickets').doc('t-other').set({
      eventId: 'some-other-event',
      tierId: 'tier-vip',
      status: 'valid',
      reference: 'X',
    });
    const result = await zones.admitToZone('t-other', EVENT, 'vip');
    assert.equal(result.ok, false);
  });

  await test('an unknown zone is refused rather than silently admitted', async () => {
    await seed();
    await ticket('t-vip', 'tier-vip');
    const result = await zones.admitToZone('t-vip', EVENT, 'no-such-zone');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'no-zone');
  });

  await test('an uncapped zone never reports full', async () => {
    await seed();
    for (const id of ['g1', 'g2', 'g3', 'g4']) {
      await ticket(id, 'tier-ga');
      assert.equal((await zones.admitToZone(id, EVENT, 'gate')).ok, true);
    }
    assert.equal((await zone('gate')).occupancy, 4);
    assert.equal((await zone('gate')).capacity, null);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
