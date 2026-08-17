/**
 * Door redemption tests, against the Firestore emulator. `npm run test:redeem`
 *
 * The headline case is the last one: two scanners hitting the same ticket at the same
 * instant. That is the defect this work exists to fix — the old client-side path read
 * the status and wrote `redeemed` as two separate operations, so both doors could read
 * `valid` and both admit. It is not a theoretical race; it is two staff phones on one
 * entrance, which is how every venue over a hundred people is actually run.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.QR_SIGNING_KEY ??= 'test-signing-key-not-a-real-secret';
process.env.FIREBASE_PROJECT_ID ??= 'ticketroyality-test';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

import { QR_VERSION, qrSigningInput, type TicketQrPayload } from '../src/shared/tickets/qr';
import { encodeRotationCode, rotationInput, rotationWindow } from '../src/shared/tickets/rotating';

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
const ADMIN = 'admin-1';
const EVENT = 'event-1';

function sign(ticketId: string, eventId: string): string {
  return createHmac('sha256', process.env.QR_SIGNING_KEY!)
    .update(qrSigningInput(QR_VERSION, ticketId, eventId))
    .digest('base64url')
    .slice(0, 32);
}

function payload(ticketId: string, eventId = EVENT): TicketQrPayload {
  return { v: QR_VERSION, t: ticketId, e: eventId, r: 'REF-1234', s: sign(ticketId, eventId) };
}

const SEED = 'rotation-seed-for-tests';

/** The code a wallet holding this seed would be showing in the given window. */
function rotatingCode(ticketId: string, windowOffset = 0): string {
  const mac = createHmac('sha256', SEED)
    .update(rotationInput(ticketId, rotationWindow() + windowOffset))
    .digest();
  return encodeRotationCode(new Uint8Array(mac));
}

let db: Firestore;
let redeemAtDoor: typeof import('../src/backend/services/redeem').redeemAtDoor;

/**
 * A refusal must be a refusal, not an outage.
 *
 * `redeemAtDoor` returns `ok: false` for "unavailable" as well as for every genuine
 * rejection, so a test that only asserts `ok === false` passes just as happily when the
 * Admin SDK is not configured and nothing was ever checked. That would be the worst kind
 * of green: a door test suite that proves nothing while looking complete.
 */
function assertRefused(result: Awaited<ReturnType<typeof redeemAtDoor>>, kind?: string) {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.notEqual(
    result.kind,
    'unavailable',
    'refused because the service was unreachable — this test proved nothing'
  );
  if (kind) assert.equal(result.kind, kind);
}

async function seed(id: string, overrides: Record<string, unknown> = {}, eventId = EVENT) {
  await db.collection('tickets').doc(id).set({
    reference: `REF-${id}`,
    eventId,
    eventTitle: 'Royal Night Live',
    organizerId: ORGANISER,
    userId: 'cust-1',
    attendeeName: 'Ada Lovelace',
    tierName: 'General',
    price: 25,
    currency: 'GBP',
    status: 'valid',
    purchasedAt: new Date().toISOString(),
    qrSignature: sign(id, eventId),
    ...overrides,
  });
}

async function statusOf(id: string): Promise<string> {
  return (await db.collection('tickets').doc(id).get()).data()?.status as string;
}

async function run() {
  // The application's own Admin SDK handle, so the test and the code under test share
  // one Firestore instance. A second `initializeApp` here caused `settings() called
  // twice`, which the test correctly surfaced as a failure.
  const admin = await import('../src/backend/firebase/admin');
  if (!admin.isAdminConfigured()) {
    throw new Error('Admin SDK not configured — the suite would pass on 503s and prove nothing.');
  }
  db = admin.getAdminDb();

  ({ redeemAtDoor } = await import('../src/backend/services/redeem'));

  for (const c of ['tickets', 'users', 'events']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db.collection('users').doc(ORGANISER).set({ uid: ORGANISER, userType: 'organiser' });
  await db.collection('users').doc(ADMIN).set({ uid: ADMIN, userType: 'superuser' });
  await db.collection('users').doc('cust-1').set({ uid: 'cust-1', userType: 'customer' });
  await db.collection('events').doc(EVENT).set({ organizerId: ORGANISER, title: 'Royal Night Live' });
  await db.collection('events').doc('event-2').set({ organizerId: 'org-2', title: 'Other' });

  console.log('\nDoor redemption (Firestore emulator)\n');

  await test('a valid signed ticket is admitted once', async () => {
    await seed('t-ok');
    const result = await redeemAtDoor(payload('t-ok'), EVENT, ORGANISER);
    assert.equal(result.ok, true);
    assert.equal(await statusOf('t-ok'), 'redeemed');
  });

  await test('the same ticket a second time is refused', async () => {
    assertRefused(await redeemAtDoor(payload('t-ok'), EVENT, ORGANISER), 'already-used');
  });

  await test('a tampered event id is refused before any lookup succeeds', async () => {
    // A genuine ticket edited to point at another door. The signature covers the event
    // id, so this cannot be made to verify.
    await seed('t-tamper');
    const forged = { ...payload('t-tamper'), e: 'event-2' };
    assertRefused(await redeemAtDoor(forged, 'event-2', ORGANISER));
    assert.equal(await statusOf('t-tamper'), 'valid', 'the real ticket must be untouched');
  });

  await test('a payload with no signature is refused', async () => {
    await seed('t-nosig');
    const bare = { ...payload('t-nosig'), s: undefined };
    assertRefused(await redeemAtDoor(bare, EVENT, ORGANISER), 'unsigned');
    assert.equal(await statusOf('t-nosig'), 'valid');
  });

  await test('a signature from a different key is refused', async () => {
    await seed('t-wrongkey');
    const forged = { ...payload('t-wrongkey'), s: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
    assertRefused(await redeemAtDoor(forged, EVENT, ORGANISER), 'unsigned');
    assert.equal(await statusOf('t-wrongkey'), 'valid');
  });

  await test('a ticket whose stored signature was tampered with is refused', async () => {
    // Defends against a database write that should not have happened: the payload is
    // recomputed, so a signature pasted onto a ticket document does not help.
    await seed('t-dbtamper', { qrSignature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    assertRefused(await redeemAtDoor(payload('t-dbtamper'), EVENT, ORGANISER), 'unsigned');
    assert.equal(await statusOf('t-dbtamper'), 'valid');
  });

  await test('an invented ticket id is refused', async () => {
    assertRefused(await redeemAtDoor(payload('t-does-not-exist'), EVENT, ORGANISER), 'invalid');
  });

  await test('a ticket for another event is refused at this door', async () => {
    await seed('t-other', {}, 'event-2');
    assertRefused(await redeemAtDoor(payload('t-other', 'event-2'), EVENT, ORGANISER), 'wrong-event');
  });

  await test('a refunded ticket cannot be walked in on', async () => {
    await seed('t-refunded', { status: 'refunded' });
    assertRefused(await redeemAtDoor(payload('t-refunded'), EVENT, ORGANISER), 'refunded');
  });

  await test('an organiser cannot scan somebody else’s event', async () => {
    await seed('t-notmine');
    const result = await redeemAtDoor(payload('t-notmine'), EVENT, 'org-2');
    assertRefused(result);
    if (!result.ok) assert.equal(result.status, 403);
    assert.equal(await statusOf('t-notmine'), 'valid');
  });

  await test('a customer cannot scan at all', async () => {
    await seed('t-cust');
    assertRefused(await redeemAtDoor(payload('t-cust'), EVENT, 'cust-1'));
    assert.equal(await statusOf('t-cust'), 'valid');
  });

  await test('an administrator can scan any door', async () => {
    await seed('t-admin');
    const result = await redeemAtDoor(payload('t-admin'), EVENT, ADMIN);
    assert.equal(result.ok, true);
  });

  await test('two doors scanning at the same instant admit exactly one', async () => {
    // The defect. The old path read then wrote, so both reads saw `valid`.
    await seed('t-race');
    const [a, b] = await Promise.all([
      redeemAtDoor(payload('t-race'), EVENT, ORGANISER),
      redeemAtDoor(payload('t-race'), EVENT, ORGANISER),
    ]);
    const admitted = [a, b].filter((r) => r.ok).length;
    assert.equal(admitted, 1, `exactly one door may admit, ${admitted} did`);
    assert.equal(await statusOf('t-race'), 'redeemed');
  });

  await test('five simultaneous scans still admit exactly one', async () => {
    await seed('t-race5');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => redeemAtDoor(payload('t-race5'), EVENT, ORGANISER))
    );
    assert.equal(results.filter((r) => r.ok).length, 1);
  });

  console.log('\nRotating codes\n');

  await test('a current rotating code is admitted', async () => {
    await seed('t-rot', { rotationSeed: SEED });
    const result = await redeemAtDoor(
      { ...payload('t-rot'), c: rotatingCode('t-rot') },
      EVENT,
      ORGANISER
    );
    assert.equal(result.ok, true);
  });

  await test('a code from the previous window still scans', async () => {
    // Phones drift. A customer with a slightly slow clock must not be refused.
    await seed('t-rot-prev', { rotationSeed: SEED });
    const result = await redeemAtDoor(
      { ...payload('t-rot-prev'), c: rotatingCode('t-rot-prev', -1) },
      EVENT,
      ORGANISER
    );
    assert.equal(result.ok, true);
  });

  await test('a screenshot from ten minutes ago is refused', async () => {
    // The whole point: a forwarded picture is stale long before it arrives.
    await seed('t-rot-old', { rotationSeed: SEED });
    const result = await redeemAtDoor(
      { ...payload('t-rot-old'), c: rotatingCode('t-rot-old', -20) },
      EVENT,
      ORGANISER
    );
    assertRefused(result, 'expired-code');
    assert.equal(await statusOf('t-rot-old'), 'valid');
  });

  await test('a code from another ticket is refused', async () => {
    // The ticket id is inside the hashed input, so one seed cannot cover two tickets.
    await seed('t-rot-a', { rotationSeed: SEED });
    await seed('t-rot-b', { rotationSeed: SEED });
    const result = await redeemAtDoor(
      { ...payload('t-rot-a'), c: rotatingCode('t-rot-b') },
      EVENT,
      ORGANISER
    );
    assertRefused(result, 'expired-code');
  });

  await test('an invented code is refused', async () => {
    await seed('t-rot-forge', { rotationSeed: SEED });
    const result = await redeemAtDoor(
      { ...payload('t-rot-forge'), c: 'AAAAAAAA' },
      EVENT,
      ORGANISER
    );
    assertRefused(result, 'expired-code');
  });

  await test('a ticket with no seed still scans on its signature alone', async () => {
    // Backward compatibility: tickets issued before rotation existed must keep working.
    await seed('t-rot-legacy');
    const result = await redeemAtDoor(payload('t-rot-legacy'), EVENT, ORGANISER);
    assert.equal(result.ok, true);
  });

  await test('a wallet with no Web Crypto falls back to the signature', async () => {
    // Sends no code at all. Refusing here would strand a customer at a door because
    // their browser is old, which is a worse outcome than a weaker code.
    await seed('t-rot-nocrypto', { rotationSeed: SEED });
    const result = await redeemAtDoor(payload('t-rot-nocrypto'), EVENT, ORGANISER);
    assert.equal(result.ok, true);
  });

  /* ------------------------------------------------------------------ */
  /* Door blocklist                                                     */
  /* ------------------------------------------------------------------ */

  const blocklist = await import('../src/backend/services/blocklist');

  async function clearBlocks() {
    const snap = await db.collection('blocklist').get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await test('a blocked email is refused at the door', async () => {
    await clearBlocks();
    await seed('t-block-1', { attendeeEmail: 'barred@example.com' });
    await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 'Barred@Example.com',
      reason: 'Barred by the venue',
      createdBy: ORGANISER,
    });

    const result = await redeemAtDoor(payload('t-block-1'), EVENT, ORGANISER);
    assertRefused(result, 'blocked');
  });

  await test('a block refuses the scan without touching the ticket', async () => {
    // The property that makes this safe to use in an argument at the front of a queue:
    // the ticket stays valid, stays refundable, and works the moment the block is lifted.
    await clearBlocks();
    await seed('t-block-2', { attendeeEmail: 'barred@example.com' });
    await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 'barred@example.com',
      reason: 'Barred',
      createdBy: ORGANISER,
    });

    await redeemAtDoor(payload('t-block-2'), EVENT, ORGANISER);
    const after = await db.collection('tickets').doc('t-block-2').get();
    assert.equal(after.data()?.status, 'valid', 'the ticket must not be consumed');
    assert.equal(after.data()?.redeemedAt, undefined);
  });

  await test('removing the block lets the same ticket straight in', async () => {
    await clearBlocks();
    await seed('t-block-3', { attendeeEmail: 'barred@example.com' });
    const added = await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 'barred@example.com',
      reason: 'Barred',
      createdBy: ORGANISER,
    });

    assertRefused(await redeemAtDoor(payload('t-block-3'), EVENT, ORGANISER), 'blocked');
    assert.equal(await blocklist.removeBlock(added.id!, ORGANISER), true);
    assert.equal((await redeemAtDoor(payload('t-block-3'), EVENT, ORGANISER)).ok, true);
  });

  await test('a blocked ticket reference stops that one ticket', async () => {
    await clearBlocks();
    await seed('t-block-4', { reference: 'TR-BANNED', attendeeEmail: 'fine@example.com' });
    await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'reference',
      value: 'tr-banned',
      reason: 'Chargeback',
      createdBy: ORGANISER,
    });

    assertRefused(await redeemAtDoor(payload('t-block-4'), EVENT, ORGANISER), 'blocked');
  });

  await test('a block on one event does not close another', async () => {
    await clearBlocks();
    await seed('t-block-5', { attendeeEmail: 'barred@example.com' });
    await blocklist.addBlock({
      organizerId: ORGANISER,
      eventId: 'some-other-event',
      kind: 'email',
      value: 'barred@example.com',
      reason: 'Barred from the other one',
      createdBy: ORGANISER,
    });

    assert.equal((await redeemAtDoor(payload('t-block-5'), EVENT, ORGANISER)).ok, true);
  });

  await test('one organiser cannot bar somebody from another organiser’s door', async () => {
    // Entries are scoped to the organiser who wrote them. A platform-wide ban is not a
    // thing one customer of ours gets to impose on another.
    await clearBlocks();
    await seed('t-block-6', { attendeeEmail: 'barred@example.com' });
    await blocklist.addBlock({
      organizerId: 'a-different-organiser',
      kind: 'email',
      value: 'barred@example.com',
      reason: 'Barred elsewhere',
      createdBy: 'a-different-organiser',
    });

    assert.equal((await redeemAtDoor(payload('t-block-6'), EVENT, ORGANISER)).ok, true);
  });

  await test('one organiser cannot delete another’s blocklist entry', async () => {
    await clearBlocks();
    const added = await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 'barred@example.com',
      reason: 'Barred',
      createdBy: ORGANISER,
    });
    assert.equal(await blocklist.removeBlock(added.id!, 'someone-else'), false);
    assert.equal((await blocklist.listBlocks(ORGANISER)).length, 1);
  });

  await test('an entry without a reason still carries something door staff can read', async () => {
    await clearBlocks();
    await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 'barred@example.com',
      reason: '   ',
      createdBy: ORGANISER,
    });
    assert.equal((await blocklist.listBlocks(ORGANISER))[0].reason, 'No reason recorded');
  });

  await clearBlocks();

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
