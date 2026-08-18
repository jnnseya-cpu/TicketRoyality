/**
 * Production kills, against the Firestore emulator. `npm run test:kill`
 *
 * The one rule under test from every angle: unsold seats block instantly, sold seats
 * become reseat cases, and nobody's ticket is ever silently invalidated.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

let passed = 0;
const failures: string[] = [];
let db: Firestore;
let kill: typeof import('../src/backend/services/production-kill');

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

const EVENT = 'evt-kill';
const ORG = 'org-1';

async function seed() {
  for (const c of ['events', 'tickets', 'reseat_cases', 'seat_locks']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db.collection('events').doc(EVENT).set({
    title: 'Arena Night',
    organizerId: ORG,
    ticketTiers: [{ id: 'stalls', name: 'Stalls', price: 30, quantity: 100, sold: 2 }],
    seating: [
      {
        id: 'sec-1',
        name: 'Stalls',
        color: '#b8860b',
        price: 30,
        startRow: 'A',
        rows: 3,
        seatsPerRow: 6,
        tierId: 'stalls',
      },
    ],
  });

  await db.collection('tickets').doc('t-1').set({
    reference: 'TR-1',
    eventId: EVENT,
    organizerId: ORG,
    userId: 'holder-1',
    tierId: 'stalls',
    tierName: 'Stalls',
    seat: 'B2',
    status: 'valid',
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    eventTitle: 'Arena Night',
  });

  await db.collection('tickets').doc('t-2').set({
    reference: 'TR-2',
    eventId: EVENT,
    organizerId: ORG,
    userId: 'holder-2',
    tierId: 'stalls',
    tierName: 'Stalls',
    seat: 'B3',
    status: 'redeemed',
    attendeeName: 'Grace Hopper',
    attendeeEmail: 'grace@example.com',
    eventTitle: 'Arena Night',
  });
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  kill = await import('../src/backend/services/production-kill');

  console.log('\nProduction kills (Firestore emulator)\n');

  await test('unsold seats block, sold become cases, redeemed are reported, never invalidated', async () => {
    await seed();
    const result = await kill.killSeats(EVENT, ORG, ['B1', 'B2', 'B3', 'Z9'], 'stage extension');
    assert.ok(result.ok);
    if (!result.ok) return;

    assert.deepEqual(result.summary.blocked, ['B1']);
    assert.equal(result.summary.cases.length, 1);
    assert.equal(result.summary.cases[0].seat, 'B2');
    assert.deepEqual(result.summary.alreadyInside, ['B3']);
    assert.deepEqual(result.summary.unknown, ['Z9']);

    // Every killed real seat left sale — sold ones included.
    const event = (await db.collection('events').doc(EVENT).get()).data()!;
    const out = event.seating[0].unavailableSeats as string[];
    assert.ok(out.includes('B1') && out.includes('B2') && out.includes('B3'));

    // And the sold ticket is untouched: still valid, still seated, until reseated.
    const ticket = (await db.collection('tickets').doc('t-1').get()).data()!;
    assert.equal(ticket.status, 'valid');
    assert.equal(ticket.seat, 'B2');
  });

  await test('killing the same area twice does not double the queue', async () => {
    await seed();
    await kill.killSeats(EVENT, ORG, ['B2'], 'rig');
    await kill.killSeats(EVENT, ORG, ['B2'], 'rig again');
    const cases = await db.collection('reseat_cases').where('eventId', '==', EVENT).get();
    assert.equal(cases.size, 1);
  });

  await test('somebody else cannot kill your seats', async () => {
    await seed();
    const result = await kill.killSeats(EVENT, 'org-other', ['B1'], 'no');
    assert.equal(result.ok, false);
  });

  await test('cases suggest distinct free same-tier seats', async () => {
    await seed();
    await db.collection('tickets').doc('t-3').set({
      reference: 'TR-3',
      eventId: EVENT,
      organizerId: ORG,
      userId: 'holder-3',
      tierId: 'stalls',
      tierName: 'Stalls',
      seat: 'C1',
      status: 'valid',
      attendeeName: 'Mary Seacole',
      attendeeEmail: 'mary@example.com',
      eventTitle: 'Arena Night',
    });
    await kill.killSeats(EVENT, ORG, ['B2', 'C1'], 'camera platform');

    const cases = await kill.openCases(EVENT, ORG);
    assert.equal(cases.length, 2);
    const suggestions = cases.map((c) => c.suggestedSeat);
    assert.ok(suggestions[0] && suggestions[1]);
    assert.notEqual(suggestions[0], suggestions[1]);
    // A suggestion is never a killed or occupied seat.
    for (const seat of suggestions) {
      assert.ok(!['B1', 'B2', 'B3', 'C1'].includes(seat!));
    }
  });

  await test('resolving a case moves the person and closes it, once', async () => {
    await seed();
    await kill.killSeats(EVENT, ORG, ['B2'], 'sound desk');
    const [openCase] = await kill.openCases(EVENT, ORG);
    assert.ok(openCase.suggestedSeat);

    const resolved = await kill.resolveCase(openCase.caseId, ORG, openCase.suggestedSeat!);
    assert.ok(resolved.ok);

    const ticket = (await db.collection('tickets').doc('t-1').get()).data()!;
    assert.equal(ticket.seat, resolved.ok ? resolved.seat : '');
    assert.equal(ticket.status, 'valid');

    const again = await kill.resolveCase(openCase.caseId, ORG, 'A1');
    assert.equal(again.ok, false);
  });

  await test('a resolution cannot land on a killed seat', async () => {
    await seed();
    await kill.killSeats(EVENT, ORG, ['B1', 'B2'], 'rig');
    const [openCase] = await kill.openCases(EVENT, ORG);
    // B1 is killed — moveSeat refuses it as not-on-sale.
    const bad = await kill.resolveCase(openCase.caseId, ORG, 'B1');
    assert.equal(bad.ok, false);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
