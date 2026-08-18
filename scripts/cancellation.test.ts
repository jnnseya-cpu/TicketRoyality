/**
 * Event cancellation, against the Firestore emulator. `npm run test:cancel`
 *
 * The rules under test: cancelling stops the sale everywhere (holds refuse), free and
 * mobile-money tickets cancel directly, Stripe tickets are LEFT for the
 * `charge.refunded` loop (the record must say why they died), mobile-money orders come
 * back as the organiser's manual work list, only settled payments count, and the whole
 * thing is owner-only and once-only.
 *
 * Stripe is unconfigured in the emulator, so the refunds API is never called here —
 * what IS tested is everything around it, which is where a cancellation corrupts data.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

let passed = 0;
const failures: string[] = [];
let db: Firestore;
let cancellation: typeof import('../src/backend/services/cancellation');
let holds: typeof import('../src/backend/services/holds');

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

const EVENT = 'evt-cancel';
const ORG = 'org-1';

async function seed() {
  for (const c of ['events', 'tickets', 'payment_events', 'checkout_holds', 'comms_log']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db.collection('events').doc(EVENT).set({
    title: 'Grand Gala',
    organizerId: ORG,
    status: 'published',
    ticketTiers: [{ id: 'ga', name: 'GA', price: 30, quantity: 100, sold: 3 }],
  });

  const ticket = (id: string, provider: string, email: string) =>
    db.collection('tickets').doc(id).set({
      reference: `TR-${id}`,
      eventId: EVENT,
      organizerId: ORG,
      userId: `u-${id}`,
      attendeeEmail: email,
      status: 'valid',
      paymentProvider: provider,
      price: provider === 'free' ? 0 : 30,
      currency: 'USD',
    });
  await ticket('free-1', 'free', 'free@example.com');
  await ticket('momo-1', 'bitripay', 'momo@example.com');
  await ticket('card-1', 'stripe', 'card@example.com');

  const payment = (id: string, data: Record<string, unknown>) =>
    db.collection('payment_events').doc(id).set(data);
  await payment('pe-card', {
    eventId: EVENT,
    intent: 'issue',
    provider: 'stripe',
    providerRef: 'pi_test_1',
    status: 'issued',
    price: 30,
    quantity: 1,
    currency: 'USD',
  });
  await payment('pe-momo', {
    eventId: EVENT,
    intent: 'issue',
    provider: 'bitripay',
    providerRef: 'MP240612.1430.A12345',
    status: 'issued',
    price: 30,
    quantity: 1,
    currency: 'USD',
  });
  await payment('pe-pending', {
    eventId: EVENT,
    intent: 'issue',
    provider: 'stripe',
    providerRef: 'pi_test_never_settled',
    status: 'pending',
    price: 30,
    quantity: 1,
    currency: 'USD',
  });
}

async function statusOf(id: string): Promise<string> {
  return (await db.collection('tickets').doc(id).get()).data()?.status as string;
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  cancellation = await import('../src/backend/services/cancellation');
  holds = await import('../src/backend/services/holds');

  console.log('\nEvent cancellation (Firestore emulator)\n');

  await test('only the owner may cancel', async () => {
    await seed();
    const result = await cancellation.cancelEvent(EVENT, 'org-2');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
    const event = (await db.collection('events').doc(EVENT).get()).data()!;
    assert.equal(event.status, 'published', 'a refused cancellation must change nothing');
  });

  await test('cancellation stamps the event and sorts every ticket by its money', async () => {
    await seed();
    const result = await cancellation.cancelEvent(EVENT, ORG);
    assert.ok(result.ok);
    if (!result.ok) return;

    const event = (await db.collection('events').doc(EVENT).get()).data()!;
    assert.equal(event.status, 'cancelled');

    // Free and mobile-money tickets die here; the Stripe ticket waits for the
    // charge.refunded webhook so its record names the refund that killed it.
    assert.equal(await statusOf('free-1'), 'cancelled');
    assert.equal(await statusOf('momo-1'), 'cancelled');
    assert.equal(await statusOf('card-1'), 'valid');

    assert.equal(result.summary.freeCancelled, 1);
    // Stripe is unconfigured in the emulator, so no refund started — and the count
    // says so instead of pretending.
    assert.equal(result.summary.refundsStarted, 0);
    assert.equal(result.summary.manualRefunds.length, 1);
    assert.equal(result.summary.manualRefunds[0].reference, 'MP240612.1430.A12345');
    assert.equal(result.summary.notified, 3);
  });

  await test('a pending payment is not refunded — it never settled', async () => {
    await seed();
    const result = await cancellation.cancelEvent(EVENT, ORG);
    assert.ok(result.ok);
    if (!result.ok) return;
    // The pending Stripe order appears in no bucket: not refunded, not manual.
    assert.equal(
      result.summary.manualRefunds.some((r) => r.reference === 'pi_test_never_settled'),
      false
    );
  });

  await test('cancelling twice is refused, and changes nothing the second time', async () => {
    await seed();
    const first = await cancellation.cancelEvent(EVENT, ORG);
    assert.ok(first.ok);
    const second = await cancellation.cancelEvent(EVENT, ORG);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.status, 409);
  });

  await test('a cancelled event refuses every hold — the sale is over on all rails', async () => {
    await seed();
    await cancellation.cancelEvent(EVENT, ORG);
    const hold = await holds.placeHold(EVENT, 'ga', 1);
    assert.equal(hold.ok, false);
    if (!hold.ok) assert.match(hold.error, /cancelled/i);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
