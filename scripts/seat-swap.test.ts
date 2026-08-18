/**
 * Seat moves and swaps, against the Firestore emulator. `npm run test:seat-swap`
 *
 * A seat move is a second way to sell the same seat twice, arriving through a different
 * door from checkout. So the assertions are the same ones the hold transaction has: two
 * people cannot end up in one seat, a move cannot reach into a tier nobody paid for, and
 * a failed half of a swap must not leave anybody seatless.
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

const EVENT = 'event-seated';
const ORG = 'org-1';
const HOLDER_A = 'user-a';
const HOLDER_B = 'user-b';

let db: Firestore;
let swap: typeof import('../src/backend/services/seat-swap');
let holds: typeof import('../src/backend/services/holds');

async function seed() {
  for (const c of ['events', 'tickets', 'seat_locks', 'checkout_holds']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db
    .collection('events')
    .doc(EVENT)
    .set({
      title: 'Playhouse',
      organizerId: ORG,
      ticketTiers: [
        { id: 'stalls', name: 'Stalls', price: 20, quantity: 100, sold: 0 },
        { id: 'circle', name: 'Circle', price: 60, quantity: 20, sold: 0 },
      ],
      seating: [
        {
          id: 'sec-stalls',
          name: 'Stalls',
          color: '#b8860b',
          price: 20,
          startRow: 'A',
          rows: 2,
          seatsPerRow: 6,
          tierId: 'stalls',
          accessibleSeats: ['B6'],
        },
        {
          id: 'sec-circle',
          name: 'Circle',
          color: '#4169e1',
          price: 60,
          startRow: 'P',
          rows: 1,
          seatsPerRow: 4,
          tierId: 'circle',
        },
      ],
    });

  await db.collection('tickets').doc('t-a').set({
    reference: 'TR-A',
    eventId: EVENT,
    organizerId: ORG,
    userId: HOLDER_A,
    tierId: 'stalls',
    tierName: 'Stalls',
    seat: 'A1',
    status: 'valid',
  });

  await db.collection('tickets').doc('t-b').set({
    reference: 'TR-B',
    eventId: EVENT,
    organizerId: ORG,
    userId: HOLDER_B,
    tierId: 'stalls',
    tierName: 'Stalls',
    seat: 'A2',
    status: 'valid',
  });
}

const seatOf = async (id: string) =>
  (await db.collection('tickets').doc(id).get()).data()?.seat as string | undefined;

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  swap = await import('../src/backend/services/seat-swap');
  holds = await import('../src/backend/services/holds');

  console.log('\nSeat moves and swaps (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Moving to a free seat                                              */
  /* ------------------------------------------------------------------ */

  await test('a holder moves themselves to a free seat', async () => {
    await seed();
    const result = await swap.moveSeat('t-a', 'A5', HOLDER_A);
    assert.equal(result.ok, true);
    assert.equal(await seatOf('t-a'), 'A5');
  });

  await test('the move leaves no lock behind, or the old seat could never be resold', async () => {
    /*
     * The lock is created and released inside the transaction: `create` is what excludes
     * the second claimant, and a lock still standing afterwards is a seat nobody can ever
     * buy, which nothing would ever notice.
     */
    await seed();
    await swap.moveSeat('t-a', 'A5', HOLDER_A);
    assert.equal((await db.collection('seat_locks').get()).size, 0);
  });

  await test('a seat somebody else is sitting in is refused', async () => {
    await seed();
    const result = await swap.moveSeat('t-a', 'A2', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'seat-taken');
    assert.equal(await seatOf('t-a'), 'A1', 'a refusal must not move anybody');
  });

  await test('a seat a checkout is holding right now is refused', async () => {
    // The race that matters: somebody at the payment page for A4 while another person
    // tries to move into it.
    await seed();
    const hold = await holds.placeHold(EVENT, 'stalls', 1, undefined, ['A4']);
    assert.equal(hold.ok, true);

    const result = await swap.moveSeat('t-a', 'A4', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'seat-taken');
  });

  await test('two people moving into one seat at the same instant: exactly one lands', async () => {
    await seed();
    const [a, b] = await Promise.all([
      swap.moveSeat('t-a', 'A5', HOLDER_A),
      swap.moveSeat('t-b', 'A5', HOLDER_B),
    ]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1, 'both moves succeeded');

    const seats = [await seatOf('t-a'), await seatOf('t-b')];
    assert.equal(new Set(seats).size, 2, `two tickets in one seat: ${seats.join(', ')}`);
  });

  await test('a cheaper ticket cannot move into a more expensive section', async () => {
    // The upgrade-without-paying case. Nothing else would look wrong: the tier counts
    // still balance, and the front row is simply occupied by somebody who did not buy it.
    await seed();
    const result = await swap.moveSeat('t-a', 'P1', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'wrong-tier');
  });

  await test('an accessible seat cannot be taken by moving into it', async () => {
    await seed();
    const result = await swap.moveSeat('t-a', 'B6', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'wrong-tier');
  });

  await test('a seat that does not exist is refused', async () => {
    await seed();
    assert.equal((await swap.moveSeat('t-a', 'A99', HOLDER_A)).ok, false);
  });

  await test('somebody else cannot move your ticket', async () => {
    await seed();
    const result = await swap.moveSeat('t-a', 'A5', HOLDER_B);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not-yours');
  });

  await test('the organiser can move a ticket at the box office', async () => {
    await seed();
    assert.equal((await swap.moveSeat('t-a', 'A5', ORG)).ok, true);
  });

  await test('a ticket already used at the door cannot move', async () => {
    // They are in the room, sitting somewhere. Rewriting the seat only makes the record
    // disagree with what happened.
    await seed();
    await db.collection('tickets').doc('t-a').update({ status: 'redeemed' });
    const result = await swap.moveSeat('t-a', 'A5', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not-live');
  });

  await test('a refunded ticket cannot move', async () => {
    await seed();
    await db.collection('tickets').doc('t-a').update({ status: 'refunded' });
    assert.equal((await swap.moveSeat('t-a', 'A5', HOLDER_A)).ok, false);
  });

  await test('moving into the seat you already have is not an error', async () => {
    await seed();
    assert.equal((await swap.moveSeat('t-a', 'a1', HOLDER_A)).ok, true);
    assert.equal(await seatOf('t-a'), 'A1');
  });

  /* ------------------------------------------------------------------ */
  /* Swapping two people                                                */
  /* ------------------------------------------------------------------ */

  await test('two holders swap seats in one transaction', async () => {
    // Neither seat is free at any point, which is why this cannot be two moves.
    await seed();
    const result = await swap.exchangeSeats('t-a', 't-b', ORG);
    assert.equal(result.ok, true);
    assert.equal(await seatOf('t-a'), 'A2');
    assert.equal(await seatOf('t-b'), 'A1');
  });

  await test('an attendee cannot swap somebody else without being asked', async () => {
    await seed();
    const result = await swap.exchangeSeats('t-a', 't-b', HOLDER_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not-yours');
    assert.equal(await seatOf('t-a'), 'A1');
  });

  await test('a swap across ticket types is refused', async () => {
    await seed();
    await db.collection('tickets').doc('t-b').update({ tierId: 'circle', seat: 'P1' });
    const result = await swap.exchangeSeats('t-a', 't-b', ORG);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'wrong-tier');

    // Neither moved: a refused swap must not be half a swap.
    assert.equal(await seatOf('t-a'), 'A1');
    assert.equal(await seatOf('t-b'), 'P1');
  });

  await test('a swap where one ticket is already used is refused', async () => {
    await seed();
    await db.collection('tickets').doc('t-b').update({ status: 'redeemed' });
    const result = await swap.exchangeSeats('t-a', 't-b', ORG);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not-live');
    assert.equal(await seatOf('t-a'), 'A1');
  });

  await test('tickets for two different events cannot be swapped', async () => {
    await seed();
    await db.collection('tickets').doc('t-b').update({ eventId: 'somewhere-else' });
    assert.equal((await swap.exchangeSeats('t-a', 't-b', ORG)).ok, false);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
