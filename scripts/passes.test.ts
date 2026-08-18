/**
 * Season pass and loyalty tests, against the Firestore emulator. `npm run test:passes`
 *
 * The pass is a money path with an unusual shape: one payment producing N issuances. So
 * the assertions are about a redelivered webhook not producing 2N tickets, about a pass
 * consuming real inventory in every fixture, and about a members' presale being decided
 * by attendance somebody actually has.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import { meetsTier, tierForAttendance } from '../src/shared/loyalty-tiers';

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

const ORGANISER = 'org-1';
const USER = 'user-1';
const FIXTURES = ['fixture-1', 'fixture-2', 'fixture-3'];

let db: Firestore;
let passes: typeof import('../src/backend/services/season-passes');
let loyalty: typeof import('../src/backend/services/loyalty');

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function seed(quantityPerFixture = 100) {
  for (const c of [
    'events',
    'tickets',
    'season_passes',
    'season_pass_purchases',
    'payment_events',
  ]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  for (const id of FIXTURES) {
    await db
      .collection('events')
      .doc(id)
      .set({
        title: `Fixture ${id}`,
        date: FUTURE,
        organizerId: ORGANISER,
        currency: 'GBP',
        ticketTiers: [
          { id: 'stand', name: 'Main stand', price: 30, quantity: quantityPerFixture, sold: 0, held: 0 },
        ],
      });
  }

  const created = await passes.createPass({
    organizerId: ORGANISER,
    name: '2026/27 Season Ticket',
    price: 300,
    currency: 'GBP',
    quantity: 50,
    eventIds: FIXTURES,
    tierIds: Object.fromEntries(FIXTURES.map((id) => [id, 'stand'])),
    active: true,
  });
  if (!created.ok) throw new Error('pass setup failed');
  return created.id;
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  passes = await import('../src/backend/services/season-passes');
  loyalty = await import('../src/backend/services/loyalty');

  console.log('\nSeason passes and loyalty (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* The ladder                                                         */
  /* ------------------------------------------------------------------ */

  await test('the ladder orders correctly, and none lets everybody through', async () => {
    assert.equal(meetsTier('none', undefined), true);
    assert.equal(meetsTier('none', 'none'), true);
    assert.equal(meetsTier('none', 'member'), false);
    assert.equal(meetsTier('member', 'member'), true);
    assert.equal(meetsTier('patron', 'regular'), true);
    assert.equal(meetsTier('member', 'patron'), false);
  });

  await test('a season pass is membership without waiting to attend', async () => {
    // Somebody who bought the whole run should not be told they are new here.
    assert.equal(tierForAttendance(0, true), 'regular');
    assert.equal(tierForAttendance(0, false), 'none');
    assert.equal(tierForAttendance(1, false), 'member');
    assert.equal(tierForAttendance(10, false), 'patron');
  });

  /* ------------------------------------------------------------------ */
  /* Passes                                                             */
  /* ------------------------------------------------------------------ */

  await test('a pass needs a tier chosen in every fixture it covers', async () => {
    // Otherwise issuance has nothing to consume and the holder turns up ticketless.
    await seed();
    const bad = await passes.createPass({
      organizerId: ORGANISER,
      name: 'Broken',
      price: 100,
      currency: 'GBP',
      quantity: 10,
      eventIds: FIXTURES,
      tierIds: { 'fixture-1': 'stand' },
      active: true,
    });
    assert.equal(bad.ok, false);
  });

  await test('a paid pass writes one issuance per fixture', async () => {
    const passId = await seed();
    const settled = await passes.settlePassPurchase({
      providerEventId: 'evt_pass_1',
      passId,
      userId: USER,
      attendeeName: 'Ada Lovelace',
      attendeeEmail: 'ada@example.com',
    });

    assert.equal(settled.ok, true);
    if (settled.ok) assert.equal(settled.issued, FIXTURES.length);

    const events = await db.collection('payment_events').get();
    assert.equal(events.size, FIXTURES.length);
    // Each one is an ordinary issuance, so the existing function does the work.
    assert.ok(events.docs.every((d) => d.data().intent === 'issue'));
  });

  await test('a redelivered webhook does not issue a second set', async () => {
    /*
     * One payment, N tickets — so a replay that slipped through would issue N more, not
     * one. Guarded twice over: the purchase record and each issuance's own id.
     */
    const passId = await seed();
    await passes.settlePassPurchase({
      providerEventId: 'evt_dup',
      passId,
      userId: USER,
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.com',
    });
    const replay = await passes.settlePassPurchase({
      providerEventId: 'evt_dup',
      passId,
      userId: USER,
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.com',
    });

    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.reason, 'duplicate');
    assert.equal((await db.collection('payment_events').get()).size, FIXTURES.length);
  });

  await test('the price is spread across the fixtures, not loaded onto one', async () => {
    // A refund of one night should reverse a sensible share rather than the whole pass.
    const passId = await seed();
    await passes.settlePassPurchase({
      providerEventId: 'evt_price',
      passId,
      userId: USER,
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.com',
    });

    const events = await db.collection('payment_events').get();
    const prices = events.docs.map((d) => d.data().price as number);
    assert.ok(prices.every((p) => p === 100), `expected 100 each, got ${prices.join(', ')}`);
  });

  await test('the pass counter moves once per purchase', async () => {
    const passId = await seed();
    await passes.settlePassPurchase({
      providerEventId: 'evt_count',
      passId,
      userId: USER,
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.com',
    });
    assert.equal((await passes.getPass(passId))?.sold, 1);
  });

  await test('a pass is refused when any single fixture is full', async () => {
    /*
     * A pass covering ten nights that can only seat somebody at nine is a refund and an
     * apology. Checked before the card, across every fixture.
     */
    const passId = await seed();
    await db
      .collection('events')
      .doc('fixture-2')
      .update({ ticketTiers: [{ id: 'stand', name: 'Main stand', price: 30, quantity: 10, sold: 10 }] });

    const availability = await passes.passAvailability(passId);
    assert.equal(availability.ok, false);
    if (!availability.ok) assert.equal(availability.reason, 'fixture-full');
  });

  await test('a sold-out pass says so', async () => {
    const passId = await seed();
    await db.collection('season_passes').doc(passId).update({ sold: 50 });
    const availability = await passes.passAvailability(passId);
    assert.equal(availability.ok, false);
    if (!availability.ok) assert.equal(availability.reason, 'sold-out');
  });

  /* ------------------------------------------------------------------ */
  /* Membership                                                         */
  /* ------------------------------------------------------------------ */

  await test('membership counts events attended, not tickets bought', async () => {
    await seed();
    // Four tickets to one fixture is a group of friends.
    for (const n of [1, 2, 3, 4]) {
      await db.collection('tickets').doc(`t-${n}`).set({
        userId: USER,
        organizerId: ORGANISER,
        eventId: 'fixture-1',
        status: 'valid',
      });
    }

    const membership = await loyalty.membershipFor(ORGANISER, USER);
    assert.equal(membership.eventsAttended, 1);
    assert.equal(membership.tier, 'member');
  });

  await test('a refunded ticket takes the loyalty back with it', async () => {
    // The reason the tier is derived rather than stored: nothing has to remember to
    // decrement a counter when an order is cancelled.
    await seed();
    await db.collection('tickets').doc('t-1').set({
      userId: USER,
      organizerId: ORGANISER,
      eventId: 'fixture-1',
      status: 'valid',
    });
    assert.equal((await loyalty.membershipFor(ORGANISER, USER)).tier, 'member');

    await db.collection('tickets').doc('t-1').update({ status: 'refunded' });
    assert.equal((await loyalty.membershipFor(ORGANISER, USER)).tier, 'none');
  });

  await test('loyalty with one organiser is not loyalty with another', async () => {
    await seed();
    await db.collection('tickets').doc('t-1').set({
      userId: USER,
      organizerId: 'a-different-organiser',
      eventId: 'someone-elses-event',
      status: 'valid',
    });
    assert.equal((await loyalty.membershipFor(ORGANISER, USER)).eventsAttended, 0);
  });

  await test('buying a pass makes somebody a regular immediately', async () => {
    const passId = await seed();
    await passes.settlePassPurchase({
      providerEventId: 'evt_member',
      passId,
      userId: USER,
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.com',
    });

    const membership = await loyalty.membershipFor(ORGANISER, USER);
    assert.equal(membership.hasSeasonPass, true);
    assert.equal(membership.tier, 'regular');
    assert.equal(meetsTier(membership.tier, 'regular'), true);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
