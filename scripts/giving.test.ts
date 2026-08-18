/**
 * Donations and Gift Aid declarations, against the Firestore emulator.
 * `npm run test:giving`
 *
 * What is asserted here is the audit trail, because that is what a Gift Aid claim is
 * defended with: a declaration is never edited, a withdrawal is never retrospective, and
 * a gift is never recorded twice however many times Stripe delivers it.
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

const CHARITY = 'org-charity';
const OTHER = 'org-other';
const DONOR = 'ada@example.com';

let db: Firestore;
let giving: typeof import('../src/backend/services/donations');

async function seed() {
  for (const c of ['donations', 'gift_aid_declarations']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const declare = (over: Partial<Parameters<typeof giving.recordDeclaration>[0]> = {}) =>
  giving.recordDeclaration({
    organizerId: CHARITY,
    email: DONOR,
    firstName: 'Ada',
    lastName: 'Lovelace',
    addressLine: '12',
    postcode: 'SW1A 1AA',
    enduring: true,
    ...over,
  });

const give = (over: Partial<Parameters<typeof giving.recordDonation>[0]> = {}) =>
  giving.recordDonation({
    providerEventId: 'evt_1',
    organizerId: CHARITY,
    donorName: 'Ada Lovelace',
    donorEmail: DONOR,
    amountMinor: 10_000,
    currency: 'GBP',
    ...over,
  });

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  giving = await import('../src/backend/services/donations');

  console.log('\nDonations and Gift Aid (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Declarations                                                       */
  /* ------------------------------------------------------------------ */

  await test('a declaration is stored with the wording the donor agreed to', async () => {
    await seed();
    const result = await declare();
    assert.equal(result.ok, true);

    if (result.ok) {
      const doc = await db.collection('gift_aid_declarations').doc(result.id).get();
      const data = doc.data()!;
      // In an audit the question is what this donor was shown on the day.
      assert.ok(data.text.includes('I am a UK taxpayer'));
      assert.ok(data.textVersion);
      assert.equal(data.postcode, 'SW1A 1AA');
    }
  });

  await test('an incomplete declaration is refused with the reasons', async () => {
    await seed();
    const result = await declare({ postcode: 'nonsense', lastName: '' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.problems.sort(), ['bad-postcode', 'no-last-name']);
    }
    assert.equal((await db.collection('gift_aid_declarations').get()).size, 0);
  });

  await test('a postcode typed without a space is stored properly, not rejected', async () => {
    await seed();
    const result = await declare({ postcode: 'ec1v9nr' });
    assert.equal(result.ok, true);
    const current = await giving.currentDeclaration(CHARITY, DONOR);
    assert.equal(current?.postcode, 'EC1V 9NR');
  });

  await test('a new declaration supersedes without erasing the old one', async () => {
    // The old address was correct when it was given, and the claims made under it were
    // correct too. Overwriting the row would destroy the evidence for both.
    await seed();
    await declare({ addressLine: '12' });
    await new Promise((r) => setTimeout(r, 5));
    await declare({ addressLine: '99' });

    assert.equal((await db.collection('gift_aid_declarations').get()).size, 2);
    assert.equal((await giving.currentDeclaration(CHARITY, DONOR))?.addressLine, '99');
  });

  await test('a declaration belongs to one charity only', async () => {
    await seed();
    await declare();
    assert.equal(await giving.currentDeclaration(OTHER, DONOR), null);
  });

  await test('a withdrawn declaration is no longer in force', async () => {
    await seed();
    await declare();
    assert.equal(await giving.withdrawDeclaration(CHARITY, DONOR), true);
    assert.equal(await giving.currentDeclaration(CHARITY, DONOR), null);
  });

  await test('withdrawing stamps rather than deletes', async () => {
    await seed();
    await declare();
    await giving.withdrawDeclaration(CHARITY, DONOR);

    const snap = await db.collection('gift_aid_declarations').get();
    assert.equal(snap.size, 1, 'the record must survive');
    assert.ok(snap.docs[0].data().withdrawnAt);
  });

  /* ------------------------------------------------------------------ */
  /* Donations                                                          */
  /* ------------------------------------------------------------------ */

  await test('a gift is recorded', async () => {
    await seed();
    assert.equal(await give(), 'recorded');
    assert.equal((await giving.donationsFor(CHARITY)).length, 1);
  });

  await test('the same Stripe event delivered twice records one gift', async () => {
    // A redelivery must never double a charity's income or its claim.
    await seed();
    assert.equal(await give(), 'recorded');
    assert.equal(await give(), 'duplicate');
    assert.equal((await giving.donationsFor(CHARITY)).length, 1);
  });

  await test('a gift of nothing is refused', async () => {
    await seed();
    assert.equal(await give({ amountMinor: 0 }), 'refused');
  });

  await test('one charity cannot see another’s donations', async () => {
    await seed();
    await give();
    await give({ providerEventId: 'evt_2', organizerId: OTHER });

    assert.equal((await giving.donationsFor(CHARITY)).length, 1);
    assert.equal((await giving.donationsFor(OTHER)).length, 1);
  });

  /* ------------------------------------------------------------------ */
  /* The claim                                                          */
  /* ------------------------------------------------------------------ */

  await test('a gift with no declaration is not claimed', async () => {
    await seed();
    await give();

    const claim = await giving.claimFor(CHARITY);
    assert.equal(claim.summary.count, 0);
    assert.equal(claim.summary.excluded['no-declaration'].count, 1);
  });

  await test('declaring afterwards makes an earlier gift claimable', async () => {
    /*
     * The reason declarations are resolved at claim time rather than stamped when the
     * money arrives. A donor who gives three times and then declares has made three
     * claimable gifts, and a link written on the day would have missed all of them.
     */
    await seed();
    await give();
    await declare({ enduring: true });

    const claim = await giving.claimFor(CHARITY);
    assert.equal(claim.summary.count, 1);
    assert.equal(claim.summary.reclaimMinor, 2_500);
  });

  await test('a gift after a withdrawal is not claimed', async () => {
    await seed();
    await declare();
    await giving.withdrawDeclaration(CHARITY, DONOR);
    await new Promise((r) => setTimeout(r, 5));
    await give({ providerEventId: 'evt_after' });

    const claim = await giving.claimFor(CHARITY);
    assert.equal(claim.summary.count, 0);
  });

  await test('a gift made before a withdrawal stays claimable', async () => {
    // Withdrawal is not retrospective. Treating it as such would surrender claims that
    // were valid when they were made.
    await seed();
    await declare();
    await give({ providerEventId: 'evt_before' });
    await new Promise((r) => setTimeout(r, 5));
    await giving.withdrawDeclaration(CHARITY, DONOR);

    const claim = await giving.claimFor(CHARITY);
    assert.equal(claim.summary.count, 1);
  });

  await test('the schedule names the donor and the amount', async () => {
    await seed();
    await declare();
    await give();

    const claim = await giving.claimFor(CHARITY);
    assert.ok(claim.csv.includes('Ada'));
    assert.ok(claim.csv.includes('SW1A 1AA'));
    assert.ok(claim.csv.includes('100.00'));
  });

  await test('a donor who never declared is absent from the schedule entirely', async () => {
    await seed();
    await declare();
    await give();
    await give({ providerEventId: 'evt_x', donorEmail: 'nobody@example.com', donorName: 'No One' });

    const claim = await giving.claimFor(CHARITY);
    assert.equal(claim.csv.split('\n').length, 2, 'header plus one row');
    assert.equal(claim.summary.excluded['no-declaration'].count, 1);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
