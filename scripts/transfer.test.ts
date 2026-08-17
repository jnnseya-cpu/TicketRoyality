/**
 * Ticket transfer tests, against the Firestore emulator. `npm run test:transfer`
 *
 * The assertion that matters is the seed rotation. Reassigning `userId` is the easy half
 * and, alone, is theatre: the previous holder still has the ticket open and their QR
 * still scans. A transfer leaving two working copies is worse than no transfer, because
 * two people believe they are getting in and one seat was sold.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';
process.env.CRON_SECRET ??= 'test-cron-secret';

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

const OWNER = 'user-owner';
const FRIEND = 'user-friend';
let db: Firestore;
let transfer: typeof import('../src/backend/services/transfer');

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function seedTicket(id: string, overrides: Record<string, unknown> = {}) {
  await db.collection('tickets').doc(id).set({
    reference: 'REF-9999',
    eventId: 'event-1',
    eventTitle: 'Royal Night Live',
    eventDate: FUTURE,
    organizerId: 'org-1',
    userId: OWNER,
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    status: 'valid',
    price: 25,
    rotationSeed: 'original-seed',
    ...overrides,
  });
}

async function ticket(id: string) {
  return (await db.collection('tickets').doc(id).get()).data() as Record<string, unknown>;
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  transfer = await import('../src/backend/services/transfer');

  for (const c of ['tickets', 'ticket_transfers', 'comms_deliveries', 'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  console.log('\nTicket transfer (Firestore emulator)\n');

  await test('the owner can send a ticket', async () => {
    await seedTicket('t-1');
    const result = await transfer.startTransfer('t-1', OWNER, 'friend@example.com');
    assert.equal(result.ok, true);
  });

  await test('a stranger cannot give away someone else’s ticket', async () => {
    await seedTicket('t-2');
    const result = await transfer.startTransfer('t-2', 'user-stranger', 'thief@example.com');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  await test('a redeemed ticket cannot be transferred', async () => {
    // The holder is already inside. Sending it on would promise a seat that is used.
    await seedTicket('t-used', { status: 'redeemed' });
    const result = await transfer.startTransfer('t-used', OWNER, 'friend@example.com');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  });

  await test('a ticket for an event that already started cannot be transferred', async () => {
    await seedTicket('t-past', { eventDate: new Date(Date.now() - 3600_000).toISOString() });
    const result = await transfer.startTransfer('t-past', OWNER, 'friend@example.com');
    assert.equal(result.ok, false);
  });

  await test('one ticket cannot have two transfers waiting', async () => {
    // Otherwise the sender promises one seat to two people and they race without knowing.
    await seedTicket('t-double');
    assert.equal((await transfer.startTransfer('t-double', OWNER, 'a@example.com')).ok, true);
    const second = await transfer.startTransfer('t-double', OWNER, 'b@example.com');
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.status, 409);
  });

  await test('accepting moves the ticket AND rotates the seed', async () => {
    // The whole point. The old holder's wallet computes codes from `original-seed`;
    // after this, none of them match.
    await seedTicket('t-accept');
    const started = await transfer.startTransfer('t-accept', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    const result = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      FRIEND,
      'Grace Hopper',
      'friend@example.com'
    );
    assert.equal(result.ok, true);

    const after = await ticket('t-accept');
    assert.equal(after.userId, FRIEND);
    assert.equal(after.attendeeName, 'Grace Hopper');
    assert.equal(after.attendeeEmail, 'friend@example.com');
    assert.notEqual(after.rotationSeed, 'original-seed', 'the old holder must lose their codes');
    assert.ok(String(after.rotationSeed).length > 20);
    assert.equal(after.transferredFrom, OWNER);
  });

  await test('a wrong token is refused', async () => {
    await seedTicket('t-token');
    const started = await transfer.startTransfer('t-token', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    const result = await transfer.acceptTransfer(
      started.transferId,
      'not-the-token',
      FRIEND,
      'Grace',
      'friend@example.com'
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
    assert.equal((await ticket('t-token')).userId, OWNER, 'the ticket must not move');
  });

  await test('a transfer cannot be accepted twice', async () => {
    await seedTicket('t-twice');
    const started = await transfer.startTransfer('t-twice', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    await transfer.acceptTransfer(started.transferId, started.token, FRIEND, 'G', 'friend@example.com');
    const again = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      'user-third',
      'T',
      'third@example.com'
    );
    assert.equal(again.ok, false);
    assert.equal((await ticket('t-twice')).userId, FRIEND, 'the second claimant gets nothing');
  });

  await test('two people racing for one transfer: exactly one wins', async () => {
    await seedTicket('t-race');
    const started = await transfer.startTransfer('t-race', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    const [a, b] = await Promise.all([
      transfer.acceptTransfer(started.transferId, started.token, FRIEND, 'A', 'a@example.com'),
      transfer.acceptTransfer(started.transferId, started.token, 'user-third', 'B', 'b@example.com'),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
  });

  await test('the sender cannot accept their own transfer', async () => {
    await seedTicket('t-self');
    const started = await transfer.startTransfer('t-self', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    const result = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      OWNER,
      'Ada',
      'ada@example.com'
    );
    assert.equal(result.ok, false);
  });

  await test('an expired link is refused', async () => {
    await seedTicket('t-expired');
    const started = await transfer.startTransfer('t-expired', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    await db.collection('ticket_transfers').doc(started.transferId).update({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const result = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      FRIEND,
      'G',
      'friend@example.com'
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 410);
  });

  await test('a cancelled transfer cannot be accepted', async () => {
    await seedTicket('t-cancel');
    const started = await transfer.startTransfer('t-cancel', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    assert.equal(await transfer.cancelTransfer(started.transferId, OWNER), true);
    const result = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      FRIEND,
      'G',
      'friend@example.com'
    );
    assert.equal(result.ok, false);
    assert.equal((await ticket('t-cancel')).userId, OWNER);
  });

  await test('only the sender can cancel', async () => {
    await seedTicket('t-cancel2');
    const started = await transfer.startTransfer('t-cancel2', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');
    assert.equal(await transfer.cancelTransfer(started.transferId, 'user-stranger'), false);
  });

  await test('a ticket refunded after the link was sent cannot be accepted', async () => {
    // Days can pass between sending and accepting. The state is re-checked inside the
    // transaction rather than trusted from when the link was created.
    await seedTicket('t-refunded');
    const started = await transfer.startTransfer('t-refunded', OWNER, 'friend@example.com');
    if (!started.ok) throw new Error('setup failed');

    await db.collection('tickets').doc('t-refunded').update({ status: 'refunded' });

    const result = await transfer.acceptTransfer(
      started.transferId,
      started.token,
      FRIEND,
      'G',
      'friend@example.com'
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
