/**
 * The payment loop, end to end, against the Firestore emulator.
 *
 *   npm run test:payment-loop      (from the repo root)
 *
 * `issuance.test.ts` proves the transaction: it cannot oversell, it is idempotent, it
 * returns inventory on refund. What was never tested is the **loop above it** — the
 * step between a verified webhook and a ticket in somebody's hand — because
 * `processPaymentEvent` was not exported and therefore not reachable from a test.
 *
 * That is the gap this file closes. The launch blocker was not "issuance might be
 * wrong"; it was "nobody has ever watched money go in one end and a ticket come out the
 * other". Every assertion here is against real Firestore documents after the real
 * function ran.
 *
 * What is still NOT covered, and must not be read as covered: Stripe's own API. Creating
 * a checkout session, signing a webhook, and moving real money all happen on Stripe's
 * side, and a test-mode purchase against the live Stripe API is the one part of this
 * loop that cannot be simulated. This file starts at "a signed webhook has been verified
 * and recorded".
 */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { EventDoc, PaymentEventDoc, TicketDoc } from './domain';
import { processPaymentEvent } from './index';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const app = initializeApp({ projectId: 'ticketroyality-test' }, 'payment-loop');
const db: Firestore = getFirestore(app);
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
  title: 'Royal Night Live',
  date: '2026-12-01T20:00:00.000Z',
  location: 'Wembley Arena, London',
  organizerId: 'org-1',
  organizerName: 'Royal Live Productions',
  status: 'published',
  ticketTiers: [
    { id: 'tier-ga', name: 'General', price: 25, quantity: 10, sold: 0 },
    { id: 'tier-last', name: 'Last One', price: 40, quantity: 1, sold: 0 },
  ],
};

/** What the Stripe webhook writes. Mirrors `recordPaymentEvent` exactly. */
function webhookWrote(overrides: Partial<PaymentEventDoc> = {}): PaymentEventDoc {
  return {
    provider: 'stripe',
    providerType: 'checkout.session.completed',
    intent: 'issue',
    status: 'pending',
    attempts: 0,
    eventId: 'event-1',
    tierId: 'tier-ga',
    userId: 'user-1',
    quantity: 2,
    price: 25,
    currency: 'GBP',
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    providerRef: 'pi_test_001',
    receivedAt: new Date().toISOString(),
    ...overrides,
  } as PaymentEventDoc;
}

async function seed() {
  await wipe();
  await db.collection('events').doc('event-1').set(EVENT);
}

async function sold(tierId: string): Promise<number> {
  const snap = await db.collection('events').doc('event-1').get();
  return (snap.data() as EventDoc).ticketTiers.find((t) => t.id === tierId)?.sold ?? 0;
}

async function ticketsFor(providerEventId: string): Promise<TicketDoc[]> {
  const marker = await db.collection('issued_payments').doc(providerEventId).get();
  const ids = (marker.data()?.ticketIds ?? []) as string[];
  if (ids.length === 0) return [];
  const docs = await db.getAll(...ids.map((id) => db.collection('tickets').doc(id)));
  return docs.filter((d) => d.exists).map((d) => d.data() as TicketDoc);
}

async function run() {
  console.log('\nPayment loop, end to end (Firestore emulator)\n');

  await test('a paid checkout produces tickets, a marker and consumed inventory', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_001').set(webhookWrote());

    const status = await processPaymentEvent('evt_001');
    assert.equal(status, 'issued', 'the loop should end in issued');

    const event = await db.collection('payment_events').doc('evt_001').get();
    assert.equal(event.data()?.status, 'issued');
    assert.ok(event.data()?.processedAt, 'processedAt must be stamped');

    const marker = await db.collection('issued_payments').doc('evt_001').get();
    assert.ok(marker.exists, 'the issuance marker is what triggers ticket delivery');

    const tickets = await ticketsFor('evt_001');
    assert.equal(tickets.length, 2);
    assert.equal(tickets[0].userId, 'user-1');
    assert.equal(tickets[0].attendeeEmail, 'ada@example.com');
    assert.equal(tickets[0].status, 'valid');
    assert.equal(await sold('tier-ga'), 2, 'inventory must be consumed');
  });

  await test('every ticket carries a unique reference', async () => {
    const tickets = await ticketsFor('evt_001');
    const refs = new Set(tickets.map((t) => t.reference));
    assert.equal(refs.size, tickets.length);
  });

  await test('a replayed webhook delivery issues nothing further', async () => {
    // Stripe redelivers. The document id is the Stripe event id, so the second
    // delivery cannot create a second document — but the loop must also be safe if it
    // runs twice against the same one.
    const before = await sold('tier-ga');
    const status = await processPaymentEvent('evt_001');
    assert.equal(status, 'issued');
    assert.equal(await sold('tier-ga'), before, 'a replay must not consume more inventory');
    assert.equal((await ticketsFor('evt_001')).length, 2);
  });

  await test('a second buyer for the last ticket is told, not silently failed', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_last_a').set(
      webhookWrote({ tierId: 'tier-last', quantity: 1, price: 40, userId: 'user-a' })
    );
    await db.collection('payment_events').doc('evt_last_b').set(
      webhookWrote({ tierId: 'tier-last', quantity: 1, price: 40, userId: 'user-b' })
    );

    const first = await processPaymentEvent('evt_last_a');
    const second = await processPaymentEvent('evt_last_b');

    assert.equal(first, 'issued');
    assert.equal(second, 'oversold', 'the loser must land in oversold, not fail silently');
    assert.equal(await sold('tier-last'), 1, 'exactly one ticket may exist');

    // This is the state the operations console exists to surface: money took, no ticket.
    const loser = await db.collection('payment_events').doc('evt_last_b').get();
    assert.equal(loser.data()?.status, 'oversold');
    assert.ok(loser.data()?.reason, 'the reason must be recorded for the operator');
  });

  await test('two simultaneous buyers cannot both get the last ticket', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_race_a').set(
      webhookWrote({ tierId: 'tier-last', quantity: 1, price: 40, userId: 'user-a' })
    );
    await db.collection('payment_events').doc('evt_race_b').set(
      webhookWrote({ tierId: 'tier-last', quantity: 1, price: 40, userId: 'user-b' })
    );

    // Concurrently, not in sequence — the sequential case above proves the check, this
    // proves the transaction.
    const outcomes = await Promise.all([
      processPaymentEvent('evt_race_a').catch(() => 'threw'),
      processPaymentEvent('evt_race_b').catch(() => 'threw'),
    ]);

    const issued = outcomes.filter((o) => o === 'issued').length;
    assert.equal(issued, 1, `exactly one should issue, got ${outcomes.join(' / ')}`);
    assert.equal(await sold('tier-last'), 1);

    const all = await db.collection('tickets').where('tierId', '==', 'tier-last').get();
    assert.equal(all.size, 1, 'the database is the authority — one ticket, not two');
  });

  await test('an event that no longer exists is terminal, not retried forever', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_missing').set(
      webhookWrote({ eventId: 'event-deleted' })
    );
    const status = await processPaymentEvent('evt_missing');
    assert.equal(status, 'failed');
    const doc = await db.collection('payment_events').doc('evt_missing').get();
    assert.ok(doc.data()?.reason, 'a human needs to know why');
  });

  await test('a refund reverses the tickets and returns the inventory', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_buy').set(webhookWrote());
    await processPaymentEvent('evt_buy');
    assert.equal(await sold('tier-ga'), 2);

    // What the charge.refunded webhook writes: no issuance fields, matched by the
    // payment intent the two events share.
    await db.collection('payment_events').doc('evt_refund').set(
      webhookWrote({
        intent: 'refund',
        providerType: 'charge.refunded',
        eventId: '',
        tierId: '',
        userId: '',
        quantity: 0,
        price: 0,
        refundsRef: 'pi_test_001',
      })
    );

    const status = await processPaymentEvent('evt_refund');
    assert.equal(status, 'refunded');
    assert.equal(await sold('tier-ga'), 0, 'inventory must go back on sale');

    const tickets = await ticketsFor('evt_buy');
    assert.ok(
      tickets.every((t) => t.status === 'refunded'),
      'every ticket must be marked refunded'
    );
  });

  await test('a replayed refund webhook does not double-return inventory', async () => {
    const before = await sold('tier-ga');
    const status = await processPaymentEvent('evt_refund');
    assert.equal(status, 'refunded');
    assert.equal(await sold('tier-ga'), before, 'a replay must not credit inventory twice');
  });

  await test('a refund that matches no issuance is terminal and says so', async () => {
    await seed();
    await db.collection('payment_events').doc('evt_orphan_refund').set(
      webhookWrote({
        intent: 'refund',
        providerType: 'charge.refunded',
        refundsRef: 'pi_never_seen',
      })
    );
    const status = await processPaymentEvent('evt_orphan_refund');
    assert.equal(status, 'failed');
    const doc = await db.collection('payment_events').doc('evt_orphan_refund').get();
    assert.match(String(doc.data()?.reason ?? ''), /refund/i);
  });

  await test('a free ticket runs the same loop and charges nothing', async () => {
    await seed();
    await db.collection('events').doc('event-1').update({
      ticketTiers: [{ id: 'tier-free', name: 'Guest list', price: 0, quantity: 300, sold: 0 }],
    });
    await db.collection('payment_events').doc('evt_free').set(
      webhookWrote({ tierId: 'tier-free', price: 0, quantity: 4 })
    );

    const status = await processPaymentEvent('evt_free');
    assert.equal(status, 'issued');
    const tickets = await ticketsFor('evt_free');
    assert.equal(tickets.length, 4);
    assert.ok(
      tickets.every((t) => t.price === 0),
      'a free ticket must not acquire a price on the way through'
    );
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  ${f}`);
    await deleteApp(app);
    process.exit(1);
  }
  await deleteApp(app);
}

void run();
