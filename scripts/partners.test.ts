/**
 * Partner attribution tests, against the Firestore emulator. `npm run test:partners`
 *
 * This is a money path, so the assertions are about money being wrong rather than about
 * code throwing:
 *
 * - a replayed payment webhook paying a partner twice for one order
 * - a link earning on an event or an organiser it was never given
 * - a promoter's allocation being exceeded, or rounded in their favour at the boundary
 * - counters drifting away from the rows behind them
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';
process.env.CRON_SECRET ??= 'test-partner-secret';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import type { PartnerLink } from '../src/shared/types';

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
const EVENT = 'event-partners';

let db: Firestore;
let partners: typeof import('../src/backend/services/partners');

async function clear() {
  for (const c of ['partner_links', 'attributions']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function link(code: string): Promise<PartnerLink> {
  return (await db.collection('partner_links').doc(code).get()).data() as PartnerLink;
}

async function make(overrides: Partial<Parameters<typeof partners.createLink>[0]> = {}) {
  return partners.createLink({
    code: 'SARAH10',
    kind: 'affiliate',
    partnerName: 'Sarah',
    partnerEmail: 'sarah@example.com',
    organizerId: ORGANISER,
    commissionPercent: 10,
    ...overrides,
  });
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  partners = await import('../src/backend/services/partners');

  console.log('\nPartner attribution (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Links                                                              */
  /* ------------------------------------------------------------------ */

  await test('a code is claimed once, globally', async () => {
    // Codes live in a URL that has to resolve without knowing whose it is, so two
    // organisers cannot both hold SUMMER25.
    await clear();
    assert.equal((await make()).ok, true);
    const second = await make({ organizerId: 'org-2' });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.status, 409);
  });

  await test('codes are normalised, so a link cannot be duplicated by case', async () => {
    await clear();
    await make({ code: 'sarah10' });
    const second = await make({ code: ' Sarah10 ' });
    assert.equal(second.ok, false);
  });

  await test('commission is capped at half of face value', async () => {
    // A link owing more than half is almost always a typo, and the first sign would be a
    // payout report saying the organiser owes more than they took.
    await clear();
    const created = await make({ commissionPercent: 300 });
    assert.equal(created.ok, true);
    if (created.ok) assert.equal(created.link.commissionPercent, 50);
  });

  await test('a partner needs a name and an address to be paid', async () => {
    await clear();
    assert.equal((await make({ partnerEmail: 'not-an-email' })).ok, false);
  });

  /* ------------------------------------------------------------------ */
  /* Attribution                                                        */
  /* ------------------------------------------------------------------ */

  await test('a sale credits the link at the stored percentage', async () => {
    await clear();
    await make({ commissionPercent: 10 });

    const result = await partners.recordAttribution({
      providerEventId: 'evt_1',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 2,
      faceMinor: 10_000,
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.commissionMinor, 1_000);

    const after = await link('SARAH10');
    assert.equal(after.sales, 1);
    assert.equal(after.ticketsSold, 2);
    assert.equal(after.grossMinor, 10_000);
    assert.equal(after.commissionMinor, 1_000);
  });

  await test('a partner buying through their own link earns nothing', async () => {
    /*
     * Self-referral: commission comes out of the organiser's face-value payout, so a
     * partner who clicks their own tracked link and buys their own tickets would
     * manufacture a discount the organiser never agreed to — up to the 50% cap, on
     * every order. The buyer email matching the link's partner email is the signal.
     */
    await clear();
    await make({ commissionPercent: 10 }); // partnerEmail: sarah@example.com

    const result = await partners.recordAttribution({
      providerEventId: 'evt_self',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 2,
      faceMinor: 10_000,
      buyerEmail: 'Sarah@Example.com', // same person, different case
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'self-referral');

    const after = await link('SARAH10');
    assert.equal(after.commissionMinor, 0, 'no commission accrues to a self-referral');
    assert.equal(after.sales, 0);
  });

  await test('a genuine buyer through the link still earns', async () => {
    // The guard must not refuse a real third-party buyer.
    await clear();
    await make({ commissionPercent: 10 });
    const result = await partners.recordAttribution({
      providerEventId: 'evt_third',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 10_000,
      buyerEmail: 'someone-else@example.com',
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.commissionMinor, 1_000);
  });

  await test('a redelivered webhook does not pay the partner twice', async () => {
    /*
     * The one that costs real money. Stripe redelivers; without idempotency the partner's
     * balance grows every time it does.
     */
    await clear();
    await make();

    await partners.recordAttribution({
      providerEventId: 'evt_dup',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 5_000,
    });
    const replay = await partners.recordAttribution({
      providerEventId: 'evt_dup',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 5_000,
    });

    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.reason, 'duplicate');
    assert.equal((await link('SARAH10')).commissionMinor, 500);
  });

  await test('a link scoped to one event earns on that event only', async () => {
    await clear();
    await make({ eventId: 'event-small' });

    const elsewhere = await partners.recordAttribution({
      providerEventId: 'evt_wrong',
      code: 'SARAH10',
      eventId: 'event-stadium',
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 20_000,
    });

    assert.equal(elsewhere.ok, false);
    if (!elsewhere.ok) assert.equal(elsewhere.reason, 'wrong-event');
    assert.equal((await link('SARAH10')).commissionMinor, 0);
  });

  await test('a link cannot earn on another organiser’s sale', async () => {
    await clear();
    await make();
    const result = await partners.recordAttribution({
      providerEventId: 'evt_other',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: 'org-someone-else',
      quantity: 1,
      faceMinor: 10_000,
    });
    assert.equal(result.ok, false);
  });

  await test('a paused link earns nothing', async () => {
    await clear();
    await make();
    await partners.setActive('SARAH10', ORGANISER, false);

    const result = await partners.recordAttribution({
      providerEventId: 'evt_paused',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 10_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'inactive');
  });

  await test('an unknown code is refused rather than silently credited', async () => {
    await clear();
    const result = await partners.recordAttribution({
      providerEventId: 'evt_ghost',
      code: 'DOESNOTEXIST',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 10_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-link');
  });

  /* ------------------------------------------------------------------ */
  /* Promoter allocations                                               */
  /* ------------------------------------------------------------------ */

  await test('an allocation stops earning without stopping the sale', async () => {
    await clear();
    await make({ kind: 'promoter', allocation: 5 });

    await partners.recordAttribution({
      providerEventId: 'evt_a',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 5,
      faceMinor: 25_000,
    });

    const beyond = await partners.recordAttribution({
      providerEventId: 'evt_b',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 1,
      faceMinor: 5_000,
    });

    assert.equal(beyond.ok, false);
    if (!beyond.ok) assert.equal(beyond.reason, 'allocation-spent');
    assert.equal((await link('SARAH10')).ticketsSold, 5, 'never past the allocation');
  });

  await test('an order straddling the allocation earns only the part inside it', async () => {
    /*
     * The boundary. Four left and an order of ten either earns on four — which is what
     * was agreed — or on ten, which is the promoter being paid for tickets outside their
     * allocation because the order happened to be large.
     */
    await clear();
    await make({ kind: 'promoter', allocation: 4, commissionPercent: 10 });

    const result = await partners.recordAttribution({
      providerEventId: 'evt_straddle',
      code: 'SARAH10',
      eventId: EVENT,
      organizerId: ORGANISER,
      quantity: 10,
      faceMinor: 100_00 * 10,
    });

    assert.equal(result.ok, true);
    const after = await link('SARAH10');
    assert.equal(after.ticketsSold, 4);
    assert.equal(after.grossMinor, 4 * 100_00);
    assert.equal(after.commissionMinor, Math.round(4 * 100_00 * 0.1));
  });

  /* ------------------------------------------------------------------ */
  /* The partner's own page                                             */
  /* ------------------------------------------------------------------ */

  await test('the stats key is required, and specific to the code', async () => {
    assert.equal(partners.statsKeyMatches('SARAH10', partners.statsKey('SARAH10')), true);
    assert.equal(partners.statsKeyMatches('SARAH10', partners.statsKey('OTHER')), false);
    assert.equal(partners.statsKeyMatches('SARAH10', ''), false);
    assert.equal(partners.statsKeyMatches('SARAH10', 'guessed-key-value'), false);
  });

  await test('counters and rows tell the same story', async () => {
    // Two numbers for one fact is how a partner and an organiser end up disagreeing.
    await clear();
    await make({ commissionPercent: 20 });

    for (const id of ['r1', 'r2', 'r3']) {
      await partners.recordAttribution({
        providerEventId: id,
        code: 'SARAH10',
        eventId: EVENT,
        organizerId: ORGANISER,
        quantity: 2,
        faceMinor: 4_000,
      });
    }

    const rows = await partners.attributionsFor('SARAH10');
    const summed = rows.reduce((total, row) => total + row.commissionMinor, 0);
    assert.equal(rows.length, 3);
    assert.equal((await link('SARAH10')).commissionMinor, summed);
  });

  await test('a click is counted, and an unknown code does not throw', async () => {
    await clear();
    await make();
    await partners.recordClick('SARAH10');
    await partners.recordClick('sarah10');
    assert.equal((await link('SARAH10')).clicks, 2);
    await partners.recordClick('NOSUCHCODE');
  });

  await clear();

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
