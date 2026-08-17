/**
 * Hospitality tests, against the Firestore emulator. `npm run test:hospitality`
 *
 * Two properties carry the weight.
 *
 * 1. **The total comes from the one pricing engine.** A ten-cover table is ten paid
 *    tickets, so the buyer-side service fee applies ten times. Pricing it as a single
 *    line would undercharge the fee by nine, silently, on the highest-value inventory
 *    the platform sells.
 *
 * 2. **Money is additive and idempotent.** A replayed deposit webhook must not credit
 *    twice and mark a half-paid table settled, because settlement is what issues the
 *    tickets.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import { computeOrderFees, toMinor } from '../src/shared/fees';
import type { HospitalityBooking, TicketTier } from '../src/shared/types';

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

const EVENT = 'event-hospitality';
const BUYER = 'user-buyer';
let db: Firestore;
let h: typeof import('../src/backend/services/hospitality');

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function seed(depositPercent = 100, quantity = 20) {
  for (const c of ['events', 'hospitality_bookings', 'checkout_holds']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection('events').doc(EVENT).set({
    title: 'Royal Night Live',
    date: FUTURE,
    organizerId: 'org-1',
    ticketTiers: [{ id: 'tier-vip', name: 'VIP table seat', price: 150, quantity, sold: 0, held: 0 }],
    hospitality: [
      {
        id: 'pkg-10',
        name: 'Champagne table',
        tierId: 'tier-vip',
        covers: 10,
        inclusions: ['Champagne on arrival', 'Three-course dinner'],
        depositPercent,
        balanceDueDate: FUTURE,
      },
    ],
  });
}

async function booking(id: string): Promise<HospitalityBooking> {
  return (await db.collection('hospitality_bookings').doc(id).get()).data() as HospitalityBooking;
}

async function tier(): Promise<TicketTier> {
  const snap = await db.collection('events').doc(EVENT).get();
  return (snap.data()?.ticketTiers as TicketTier[])[0];
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  h = await import('../src/backend/services/hospitality');

  console.log('\nHospitality (Firestore emulator)\n');

  await test('a table is priced as its covers, not as one line', async () => {
    // The fee is per paid ticket. A ten-cover table pricing as one would undercharge
    // the service fee by nine on the most expensive thing on sale.
    await seed();
    const result = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const expected = computeOrderFees([{ faceMinor: toMinor(150), qty: 10 }]);
    assert.equal(result.totalMinor, expected.buyerTotalMinor);
    assert.equal(result.totalMinor, 150_00 * 10 + expected.serviceFeeMinor);
  });

  await test('booking holds the covers so the table stops being sellable', async () => {
    await seed();
    await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    assert.equal((await tier()).held, 10, 'ten covers must be reserved');
    assert.equal((await tier()).sold ?? 0, 0, 'a reservation is not a sale');
  });

  await test('a table that would oversell the tier is refused', async () => {
    await seed(100, 15); // room for one table of ten, not two
    assert.equal((await h.bookTable(EVENT, 'pkg-10', BUYER, 'a@example.com')).ok, true);
    const second = await h.bookTable(EVENT, 'pkg-10', 'user-2', 'b@example.com');
    assert.equal(second.ok, false);
  });

  await test('pay-in-full means the deposit is the whole total', async () => {
    await seed(100);
    const result = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!result.ok) throw new Error('setup failed');
    assert.equal(result.depositMinor, result.totalMinor);
  });

  await test('a 25% deposit is a quarter of the total, not of face value', async () => {
    await seed(25);
    const result = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!result.ok) throw new Error('setup failed');
    assert.equal(result.depositMinor, Math.round(result.totalMinor * 0.25));
    assert.ok(result.depositMinor < result.totalMinor);
  });

  await test('a deposit leaves the booking unsettled — no tickets yet', async () => {
    // The property that protects the organiser. A deposit reserves; it does not admit.
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const paid = await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.status, 'deposit_paid');
    assert.equal(paid.outstandingMinor, b.totalMinor - b.depositMinor);
    assert.equal((await booking(b.bookingId)).ticketIds, undefined);
  });

  await test('settling the balance marks the booking paid', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');
    const settled = await h.recordBookingPayment(
      b.bookingId,
      b.totalMinor - b.depositMinor,
      'pi_balance'
    );
    assert.equal(settled.ok, true);
    if (!settled.ok) return;
    assert.equal(settled.status, 'paid');
    assert.equal(settled.outstandingMinor, 0);
  });

  await test('a replayed payment webhook does not credit twice', async () => {
    // Otherwise a half-paid table reads settled, and settlement is what issues tickets.
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');
    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');

    assert.equal((await booking(b.bookingId)).paidMinor, b.depositMinor, 'paid once');
    assert.equal((await booking(b.bookingId)).status, 'deposit_paid');
  });

  await test('overpaying never produces a negative outstanding balance', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const result = await h.recordBookingPayment(b.bookingId, b.totalMinor * 2, 'pi_over');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outstandingMinor, 0);
    assert.equal(result.status, 'paid');
  });

  await test('guests can be named up to the table size', async () => {
    await seed();
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const result = await h.setGuests(
      b.bookingId,
      BUYER,
      Array.from({ length: 10 }, (_, i) => ({ name: `Guest ${i + 1}` }))
    );
    assert.equal(result.ok, true);
    assert.equal((await booking(b.bookingId)).guests.length, 10);
  });

  await test('more names than covers is refused', async () => {
    // Fourteen names on a ten-cover table is either a mistake or four people getting in
    // free. Better refused here than discovered at the door.
    await seed();
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const result = await h.setGuests(
      b.bookingId,
      BUYER,
      Array.from({ length: 14 }, (_, i) => ({ name: `Guest ${i + 1}` }))
    );
    assert.equal(result.ok, false);
  });

  await test('someone else cannot edit your guest list', async () => {
    await seed();
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const result = await h.setGuests(b.bookingId, 'user-stranger', [{ name: 'Intruder' }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  await test('cancelling returns the covers to sale', async () => {
    await seed();
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');
    assert.equal((await tier()).held, 10);

    const result = await h.cancelBooking(b.bookingId, BUYER);
    assert.equal(result.ok, true);
    assert.equal((await tier()).held, 0, 'the table must go back on sale');
  });

  await test('cancelling reports what is owed rather than moving money', async () => {
    // A cancel button that quietly refunded would be a second refund mechanism. The
    // platform has one, with its own idempotency and audit.
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');
    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');

    const result = await h.cancelBooking(b.bookingId, BUYER);
    assert.equal(result.refundOwedMinor, b.depositMinor);
    assert.equal((await booking(b.bookingId)).status, 'cancelled');
  });

  await test('a cancelled booking accepts no further payment', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');
    await h.cancelBooking(b.bookingId, BUYER);

    const result = await h.recordBookingPayment(b.bookingId, 100, 'pi_late');
    assert.equal(result.ok, false);
  });

  await test('a table on a past event cannot be booked', async () => {
    await seed();
    await db.collection('events').doc(EVENT).update({
      date: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const result = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    assert.equal(result.ok, false);
  });

  await test('outstanding bookings list what the organiser must chase', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');
    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');

    const outstanding = await h.outstandingBookings(EVENT);
    assert.equal(outstanding.length, 1);
    assert.equal(outstanding[0].outstandingMinor, b.totalMinor - b.depositMinor);
    assert.equal(outstanding[0].covers, 10);
  });

  await test('settling returns exactly what issuance needs, and a deposit returns nothing', async () => {
    /*
     * The handoff. Tickets are not issued here — the settled payload is written to
     * `payment_events` and the function that has always issued tickets does it, with the
     * same oversell guard and the same hold. This asserts the payload is complete and
     * that a deposit does not carry one, because a deposit that issued tickets would put
     * ten people in the room for a quarter of the money.
     */
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const deposit = await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');
    if (!deposit.ok) throw new Error('deposit failed');
    assert.equal(deposit.settled, undefined, 'a deposit must not trigger issuance');

    const balance = await h.recordBookingPayment(
      b.bookingId,
      b.totalMinor - b.depositMinor,
      'pi_balance'
    );
    if (!balance.ok) throw new Error('balance failed');
    assert.ok(balance.settled, 'settlement must carry an issuance payload');
    assert.equal(balance.settled?.covers, 10);
    assert.equal(balance.settled?.tierId, 'tier-vip');
    assert.equal(balance.settled?.buyerUserId, BUYER);
    // Face value per cover, not the settled total: a ticket carrying the whole table's
    // value — service fee included — settles a partial refund wrongly.
    assert.equal(balance.settled?.unitFaceMinor, toMinor(150));
    assert.ok(balance.settled?.holdId, 'issuance must be able to consume the table hold');
  });

  await test('a replayed settlement does not hand issuance a second set of tickets', async () => {
    await seed(100);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const first = await h.recordBookingPayment(b.bookingId, b.totalMinor, 'pi_full');
    const replay = await h.recordBookingPayment(b.bookingId, b.totalMinor, 'pi_full');
    if (!first.ok || !replay.ok) throw new Error('payment failed');

    assert.ok(first.settled, 'the real settlement issues');
    assert.equal(replay.settled, undefined, 'the replay must issue nothing');
  });

  await test('the table is held past a checkout window, to the balance due date', async () => {
    // A fifteen-minute hold would let the sweep resell a table somebody has already put
    // a deposit on.
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    const doc = await db.collection('hospitality_bookings').doc(b.bookingId).get();
    const holdId = doc.data()?.holdId as string;
    const hold = await db.collection('checkout_holds').doc(holdId).get();
    const expires = new Date(hold.data()?.expiresAt as string).getTime();

    assert.ok(
      expires > Date.now() + 24 * 60 * 60 * 1000,
      'the hold must outlive a checkout by days, not minutes'
    );
  });

  await test('what is owed is the deposit first, then the balance', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    assert.equal(h.amountDueMinor(await booking(b.bookingId)), b.depositMinor);
    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');
    assert.equal(h.amountDueMinor(await booking(b.bookingId)), b.totalMinor - b.depositMinor);
    await h.recordBookingPayment(b.bookingId, b.totalMinor - b.depositMinor, 'pi_balance');
    assert.equal(h.amountDueMinor(await booking(b.bookingId)), 0);
  });

  await test('a booking whose table went back on sale is marked lapsed, not left claiming it', async () => {
    // The disagreement this closes: the sweep returns the covers, and the booking keeps
    // saying the table is theirs. That is two parties at one table.
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');
    await h.recordBookingPayment(b.bookingId, b.depositMinor, 'pi_deposit');

    const holds = await import('../src/backend/services/holds');
    const holdId = (await db.collection('hospitality_bookings').doc(b.bookingId).get()).data()
      ?.holdId as string;
    await holds.releaseHold(holdId, 'expired');

    assert.equal(await h.expireLapsedBookings(), 1);
    assert.equal((await booking(b.bookingId)).status, 'expired');
    assert.equal((await tier()).held, 0, 'the covers are back on sale');
  });

  await test('a booking that still holds its table is left alone by the sweep', async () => {
    await seed(25);
    const b = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    if (!b.ok) throw new Error('setup failed');

    assert.equal(await h.expireLapsedBookings(), 0);
    assert.equal((await booking(b.bookingId)).status, 'deposit_pending');
  });

  await test('an organiser sees every table on their event, a buyer only their own', async () => {
    await seed(100, 40);
    const mine = await h.bookTable(EVENT, 'pkg-10', BUYER, 'buyer@example.com');
    const theirs = await h.bookTable(EVENT, 'pkg-10', 'user-2', 'other@example.com');
    if (!mine.ok || !theirs.ok) throw new Error('setup failed');

    assert.equal((await h.bookingsForEvent(EVENT)).length, 2);
    assert.equal((await h.bookingsForUser(BUYER)).length, 1);
    assert.equal((await h.bookingsForUser(BUYER))[0].buyerEmail, 'buyer@example.com');
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
