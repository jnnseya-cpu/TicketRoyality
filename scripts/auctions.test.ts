/**
 * Auction lots, against the Firestore emulator. `npm run test:auctions`
 *
 * The assertions are the three ways a charity auction embarrasses its organiser in front
 * of a room: two people told they are winning, a bid landing after the hammer, and the
 * clock cutting off bidding that is visibly still happening.
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

const EVENT = 'event-gala';
const ORG = 'org-1';

let db: Firestore;
let auctions: typeof import('../src/backend/services/auctions');

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

async function seed() {
  for (const c of ['auction_lots', 'auction_bids']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const lot = (over: Partial<Parameters<typeof auctions.createLot>[0]> = {}) =>
  auctions.createLot({
    eventId: EVENT,
    organizerId: ORG,
    title: 'Signed shirt',
    startMinor: 5_000,
    incrementMinor: 1_000,
    closesAt: inMinutes(60),
    extendMinutes: 0,
    ...over,
  });

const bid = (lotId: string, amountMinor: number, who = 'ada') =>
  auctions.placeBid({
    lotId,
    amountMinor,
    userId: who,
    name: who === 'ada' ? 'Ada Lovelace' : 'Grace Hopper',
    email: `${who}@example.com`,
  });

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  auctions = await import('../src/backend/services/auctions');

  console.log('\nAuction lots (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Bidding                                                            */
  /* ------------------------------------------------------------------ */

  await test('the first bid must reach the starting price', async () => {
    await seed();
    const id = (await lot())!;

    const low = await bid(id, 4_000);
    assert.equal(low.ok, false);
    if (!low.ok) assert.equal(low.reason, 'too-low');

    assert.equal((await bid(id, 5_000)).ok, true);
  });

  await test('a later bid must clear the increment', async () => {
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000, 'ada');

    const nudge = await bid(id, 5_500, 'grace');
    assert.equal(nudge.ok, false);
    // The refusal carries what it would now take, so the bidder can act rather than guess.
    if (!nudge.ok) assert.equal(nudge.minimumMinor, 6_000);

    assert.equal((await bid(id, 6_000, 'grace')).ok, true);
  });

  await test('two bids at the same instant leave exactly one leader', async () => {
    /*
     * The failure this prevents is not lost data — it is two people in the same room
     * both told they are winning, which is the moment an organiser stops trusting the
     * software in front of their guests.
     */
    await seed();
    const id = (await lot())!;

    const [a, b] = await Promise.all([bid(id, 5_000, 'ada'), bid(id, 5_000, 'grace')]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1);

    const stored = (await db.collection('auction_lots').doc(id).get()).data()!;
    assert.equal(stored.highBidMinor, 5_000);
    assert.equal(stored.bidCount, 1);
  });

  await test('you cannot outbid yourself', async () => {
    // It only raises the price you will pay, and an auction that allows it looks like
    // it is milking the room.
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000, 'ada');

    const again = await bid(id, 9_000, 'ada');
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.reason, 'own-bid');
  });

  await test('every bid is kept, not just the winning one', async () => {
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000, 'ada');
    await bid(id, 6_000, 'grace');

    assert.equal((await db.collection('auction_bids').get()).size, 2);
  });

  await test('a bid on a lot that no longer exists is refused', async () => {
    await seed();
    const result = await bid('no-such-lot', 5_000);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-lot');
  });

  /* ------------------------------------------------------------------ */
  /* The clock                                                          */
  /* ------------------------------------------------------------------ */

  await test('a bid after the close is refused', async () => {
    await seed();
    const id = (await lot({ closesAt: inMinutes(-1) }))!;

    const late = await bid(id, 9_000);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.reason, 'closed');
  });

  await test('a late bid pushes the close out rather than being cut off', async () => {
    /*
     * The room bidding in the last ten seconds is the whole point of an auction. A hard
     * cutoff rewards whoever has the fastest connection over whoever will pay most.
     */
    await seed();
    const closesAt = inMinutes(1);
    const id = (await lot({ closesAt, extendMinutes: 2 }))!;

    const result = await bid(id, 5_000);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.closesAt > closesAt, 'the close should have moved out');
  });

  await test('an early bid leaves the closing time alone', async () => {
    // Extending on every bid would make a lot with steady interest run all night.
    await seed();
    const closesAt = inMinutes(60);
    const id = (await lot({ closesAt, extendMinutes: 2 }))!;

    const result = await bid(id, 5_000);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.closesAt, closesAt);
  });

  /* ------------------------------------------------------------------ */
  /* Closing                                                            */
  /* ------------------------------------------------------------------ */

  await test('a lot whose time is up closes with a winner', async () => {
    await seed();
    const id = (await lot({ closesAt: inMinutes(60) }))!;
    await bid(id, 5_000, 'ada');
    // Bring the close forward rather than waiting an hour for the assertion.
    await db.collection('auction_lots').doc(id).update({ closesAt: inMinutes(-1) });

    const outcomes = await auctions.closeDueLots();
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].sold, true);
    assert.equal(outcomes[0].amountMinor, 5_000);
    assert.equal(outcomes[0].winnerEmail, 'ada@example.com');
  });

  await test('a lot that never reached its reserve does not sell', async () => {
    // The reserve is the organiser's floor. Selling below it is selling something they
    // said they would not.
    await seed();
    const id = (await lot({ reserveMinor: 20_000 }))!;
    await bid(id, 5_000);
    await db.collection('auction_lots').doc(id).update({ closesAt: inMinutes(-1) });

    const outcomes = await auctions.closeDueLots();
    assert.equal(outcomes[0].sold, false);
    assert.equal(outcomes[0].amountMinor, 0);
  });

  await test('a lot with no bids closes unsold rather than erroring', async () => {
    await seed();
    const id = (await lot())!;
    await db.collection('auction_lots').doc(id).update({ closesAt: inMinutes(-1) });

    const outcomes = await auctions.closeDueLots();
    assert.equal(outcomes[0].sold, false);
  });

  await test('closing twice does not close a lot twice', async () => {
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000);
    await db.collection('auction_lots').doc(id).update({ closesAt: inMinutes(-1) });

    assert.equal((await auctions.closeDueLots()).length, 1);
    assert.equal((await auctions.closeDueLots()).length, 0);
  });

  await test('a closed lot takes no further bids', async () => {
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000, 'ada');
    await db.collection('auction_lots').doc(id).update({ closesAt: inMinutes(-1) });
    await auctions.closeDueLots();

    const late = await bid(id, 50_000, 'grace');
    assert.equal(late.ok, false);
  });

  await test('a won lot can be marked paid', async () => {
    await seed();
    const id = (await lot())!;
    await bid(id, 5_000);
    assert.equal(await auctions.markLotPaid(id, 'pi_123'), true);
    assert.equal((await db.collection('auction_lots').doc(id).get()).data()?.status, 'paid');
  });

  await test('lots are listed for their own event only', async () => {
    await seed();
    await lot();
    await lot({ eventId: 'somewhere-else' });

    assert.equal((await auctions.lotsFor(EVENT)).length, 1);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
