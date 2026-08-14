/**
 * Issuance tests, run against the Firestore emulator.
 *
 * These exercise the real transaction rather than a mock, because every bug worth
 * catching here is a concurrency or atomicity bug and a mock has neither property.
 *
 *   npm run test          (from functions/)
 *
 * No test framework: a runner would be a dependency added to a deployed package to
 * assert nine things. `node:assert` is in the runtime already.
 */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import type { EventDoc, PaymentEventDoc } from './domain';
import { PermanentIssuanceError, issueTickets, refundTickets, generateReference } from './issuance';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const app = initializeApp({ projectId: 'ticketroyality-test' });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function wipe() {
  for (const name of ['tickets', 'events', 'issued_payments', 'payment_events']) {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const EVENT: EventDoc = {
  title: 'Test Event',
  date: '2026-12-01T20:00:00.000Z',
  location: 'London',
  organizerId: 'org-1',
  organizerName: 'Test Organiser',
  status: 'published',
  ticketTiers: [
    { id: 'tier-ga', name: 'General', price: 25, quantity: 10, sold: 0 },
    { id: 'tier-vip', name: 'VIP', price: 75, quantity: 2, sold: 0 },
  ],
};

function payment(overrides: Partial<PaymentEventDoc> = {}): PaymentEventDoc {
  return {
    provider: 'stripe',
    providerType: 'checkout.session.completed',
    intent: 'issue',
    status: 'pending',
    eventId: 'event-1',
    tierId: 'tier-ga',
    userId: 'user-1',
    quantity: 2,
    price: 25,
    currency: 'GBP',
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function seed() {
  await wipe();
  await db.collection('events').doc('event-1').set(EVENT);
}

async function tierSold(tierId: string): Promise<number> {
  const snap = await db.collection('events').doc('event-1').get();
  const tiers = (snap.data() as EventDoc).ticketTiers;
  return tiers.find((t) => t.id === tierId)?.sold ?? 0;
}

async function run() {
  console.log('\nIssuance (Firestore emulator)\n');

  await test('issues the requested number of tickets and consumes inventory', async () => {
    await seed();
    const result = await issueTickets(db, 'evt_1', payment());

    assert.equal(result.duplicate, false);
    assert.equal(result.ticketIds.length, 2);
    assert.equal(await tierSold('tier-ga'), 2);

    const tickets = await db.collection('tickets').get();
    assert.equal(tickets.size, 2);

    const ticket = tickets.docs[0].data();
    assert.equal(ticket.status, 'valid');
    assert.equal(ticket.tierName, 'General');
    assert.equal(ticket.eventTitle, 'Test Event');
    assert.equal(ticket.userId, 'user-1');
    assert.match(ticket.reference, /^TR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  await test('a replayed payment issues nothing further', async () => {
    await seed();
    await issueTickets(db, 'evt_replay', payment());
    const second = await issueTickets(db, 'evt_replay', payment());

    assert.equal(second.duplicate, true, 'second call must report a duplicate');
    assert.equal((await db.collection('tickets').get()).size, 2, 'no extra tickets');
    assert.equal(await tierSold('tier-ga'), 2, 'inventory consumed once');
  });

  await test('concurrent issuance cannot oversell the last tickets', async () => {
    await seed();

    // Two buyers, two VIP tickets left, two tickets each. Exactly one must win.
    const results = await Promise.allSettled([
      issueTickets(db, 'evt_race_a', payment({ tierId: 'tier-vip', quantity: 2, price: 75 })),
      issueTickets(db, 'evt_race_b', payment({ tierId: 'tier-vip', quantity: 2, price: 75 })),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const oversold = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof PermanentIssuanceError
    );

    assert.equal(fulfilled.length, 1, 'exactly one buyer should succeed');
    assert.equal(oversold.length, 1, 'the other must fail as oversold');
    assert.equal(await tierSold('tier-vip'), 2, 'tier must not exceed its capacity');
    assert.equal((await db.collection('tickets').get()).size, 2);
  });

  await test('refuses to oversell a tier outright', async () => {
    await seed();
    await assert.rejects(
      () => issueTickets(db, 'evt_over', payment({ tierId: 'tier-vip', quantity: 5 })),
      (error: unknown) =>
        error instanceof PermanentIssuanceError && error.status === 'oversold'
    );
    assert.equal((await db.collection('tickets').get()).size, 0, 'no partial issuance');
    assert.equal(await tierSold('tier-vip'), 0, 'counter untouched');
  });

  await test('a missing event is terminal, not retried', async () => {
    await seed();
    await assert.rejects(
      () => issueTickets(db, 'evt_missing', payment({ eventId: 'does-not-exist' })),
      (error: unknown) => error instanceof PermanentIssuanceError && error.status === 'failed'
    );
  });

  await test('a missing tier is terminal', async () => {
    await seed();
    await assert.rejects(
      () => issueTickets(db, 'evt_no_tier', payment({ tierId: 'tier-nope' })),
      (error: unknown) => error instanceof PermanentIssuanceError && error.status === 'failed'
    );
  });

  await test('refund marks tickets refunded and returns inventory', async () => {
    await seed();
    await issueTickets(db, 'evt_refund', payment());
    assert.equal(await tierSold('tier-ga'), 2);

    const { refunded } = await refundTickets(db, 'evt_refund', 'customer request');

    assert.equal(refunded, 2);
    assert.equal(await tierSold('tier-ga'), 0, 'inventory returned');

    const tickets = await db.collection('tickets').get();
    assert.ok(
      tickets.docs.every((d) => d.data().status === 'refunded'),
      'every ticket marked refunded'
    );
    assert.equal(tickets.size, 2, 'tickets are marked, never deleted');
  });

  await test('refunding twice does not double-return inventory', async () => {
    await seed();
    await issueTickets(db, 'evt_double', payment());
    await refundTickets(db, 'evt_double', 'first');
    const second = await refundTickets(db, 'evt_double', 'second');

    assert.equal(second.refunded, 0);
    assert.equal(await tierSold('tier-ga'), 0, 'counter must not go negative');
  });

  await test('a redeemed ticket is not silently refunded', async () => {
    await seed();
    const { ticketIds } = await issueTickets(db, 'evt_redeemed', payment());

    await db.collection('tickets').doc(ticketIds[0]).update({ status: 'redeemed' });

    const { refunded } = await refundTickets(db, 'evt_redeemed', 'after attendance');

    assert.equal(refunded, 1, 'only the unused ticket is reversed');
    assert.equal(
      (await db.collection('tickets').doc(ticketIds[0]).get()).data()?.status,
      'redeemed',
      'the attended ticket keeps its status'
    );
    assert.equal(await tierSold('tier-ga'), 1, 'the attended ticket still consumes inventory');
  });

  await test('references are unique across a large batch', async () => {
    const seen = new Set(Array.from({ length: 20_000 }, () => generateReference()));
    assert.ok(seen.size > 19_990, `expected near-unique references, got ${seen.size}/20000`);
  });

  await wipe();
  await deleteApp(app);

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
