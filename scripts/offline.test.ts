/**
 * Offline door tests, against the Firestore emulator. `npm run test:offline`
 *
 * Offline mode trades a guarantee for availability, so these tests are about the trade
 * being the one that was intended:
 *
 * - a screenshot still fails, because the rotating code is still checked
 * - a redemption is stamped with when the person walked in, not when the queue drained
 * - a ticket admitted twice is reported with both times rather than silently overwritten
 *
 * The last one is the whole argument for offline mode being defensible: the guarantee
 * weakens from "cannot happen" to "cannot happen unnoticed".
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

import {
  decideOffline,
  findConflicts,
  orderForSync,
  type OfflineManifest,
  type QueuedRedemption,
} from '../src/shared/tickets/offline';
import { QR_VERSION } from '../src/shared/tickets/qr';
import {
  encodeRotationCode,
  rotationInput,
  rotationWindow,
} from '../src/shared/tickets/rotating';

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

const EVENT = 'event-offline';
const ORGANISER = 'org-1';
const SEED = 'offline-rotation-seed';

let db: Firestore;
let sync: typeof import('../src/backend/services/offline-sync');

function code(ticketId: string, offset = 0): string {
  const mac = createHmac('sha256', SEED)
    .update(rotationInput(ticketId, rotationWindow() + offset))
    .digest();
  return encodeRotationCode(new Uint8Array(mac));
}

function manifest(overrides: Partial<OfflineManifest['tickets'][number]> = {}): OfflineManifest {
  return {
    eventId: EVENT,
    eventTitle: 'Warehouse Night',
    fetchedAt: new Date().toISOString(),
    tickets: [
      {
        id: 't-1',
        reference: 'TR-0001',
        attendeeName: 'Ada Lovelace',
        tierName: 'General',
        status: 'valid',
        rotationSeed: SEED,
        ...overrides,
      },
    ],
  };
}

function payload(ticketId: string, rotating?: string) {
  return { v: QR_VERSION, t: ticketId, e: EVENT, r: 'TR-0001', c: rotating };
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  sync = await import('../src/backend/services/offline-sync');

  console.log('\nOffline door (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Deciding with no signal                                            */
  /* ------------------------------------------------------------------ */

  await test('a valid ticket with a current code is admitted', async () => {
    const decision = await decideOffline(manifest(), payload('t-1', code('t-1')), new Set());
    assert.equal(decision.admit, true);
  });

  await test('a screenshot from ten minutes ago is refused offline too', async () => {
    /*
     * The part most offline modes drop, because checking it needs the seed. The manifest
     * carries seeds precisely so this still works.
     */
    const decision = await decideOffline(manifest(), payload('t-1', code('t-1', -20)), new Set());
    assert.equal(decision.admit, false);
    if (!decision.admit) assert.equal(decision.kind, 'expired-code');
  });

  await test('a code from the window either side is still accepted', async () => {
    // Phones drift. Refusing somebody with a slightly slow clock at a door is worse than
    // a thirty-second wider window.
    const decision = await decideOffline(manifest(), payload('t-1', code('t-1', -1)), new Set());
    assert.equal(decision.admit, true);
  });

  await test('the same ticket twice on one device is refused', async () => {
    const decision = await decideOffline(
      manifest(),
      payload('t-1', code('t-1')),
      new Set(['t-1'])
    );
    assert.equal(decision.admit, false);
    if (!decision.admit) assert.equal(decision.kind, 'already-used-here');
  });

  await test('a ticket bought after the download says so, rather than accusing anyone', async () => {
    const decision = await decideOffline(manifest(), payload('t-new', code('t-new')), new Set());
    assert.equal(decision.admit, false);
    if (!decision.admit) {
      assert.equal(decision.kind, 'not-in-manifest');
      assert.match(decision.error, /bought after/);
    }
  });

  await test('a refunded ticket in the list is refused', async () => {
    const decision = await decideOffline(
      manifest({ status: 'refunded' }),
      payload('t-1', code('t-1')),
      new Set()
    );
    assert.equal(decision.admit, false);
  });

  await test('a ticket for another event is refused', async () => {
    const decision = await decideOffline(
      manifest(),
      { ...payload('t-1', code('t-1')), e: 'another-event' },
      new Set()
    );
    assert.equal(decision.admit, false);
    if (!decision.admit) assert.equal(decision.kind, 'wrong-event');
  });

  await test('a ticket with no seed still scans, as it does online', async () => {
    const decision = await decideOffline(
      manifest({ rotationSeed: undefined }),
      payload('t-1'),
      new Set()
    );
    assert.equal(decision.admit, true);
  });

  /* ------------------------------------------------------------------ */
  /* The queue                                                          */
  /* ------------------------------------------------------------------ */

  await test('conflicts are found, with every time the ticket was used', async () => {
    const queue: QueuedRedemption[] = [
      { ticketId: 't-1', reference: 'TR-1', eventId: EVENT, at: '2026-09-01T21:06:00.000Z', deviceId: 'door-b' },
      { ticketId: 't-1', reference: 'TR-1', eventId: EVENT, at: '2026-09-01T21:04:00.000Z', deviceId: 'door-a' },
      { ticketId: 't-2', reference: 'TR-2', eventId: EVENT, at: '2026-09-01T21:05:00.000Z', deviceId: 'door-a' },
    ];

    const conflicts = findConflicts(queue);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].ticketId, 't-1');
    assert.deepEqual(conflicts[0].times, [
      '2026-09-01T21:04:00.000Z',
      '2026-09-01T21:06:00.000Z',
    ]);
  });

  await test('the queue syncs oldest first', async () => {
    // So when two doors admitted one ticket, the ticket ends up stamped with the time the
    // first person walked in rather than the second.
    const queue: QueuedRedemption[] = [
      { ticketId: 'b', reference: 'B', eventId: EVENT, at: '2026-09-01T22:00:00.000Z', deviceId: 'd' },
      { ticketId: 'a', reference: 'A', eventId: EVENT, at: '2026-09-01T20:00:00.000Z', deviceId: 'd' },
    ];
    assert.deepEqual(orderForSync(queue).map((q) => q.ticketId), ['a', 'b']);
  });

  /* ------------------------------------------------------------------ */
  /* Applying it                                                        */
  /* ------------------------------------------------------------------ */

  async function seed() {
    for (const c of ['events', 'tickets', 'users']) {
      const snap = await db.collection(c).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
    await db.collection('events').doc(EVENT).set({ title: 'Warehouse', organizerId: ORGANISER });
    await db.collection('users').doc(ORGANISER).set({ userType: 'organiser' });
    await db.collection('tickets').doc('t-1').set({
      reference: 'TR-0001',
      eventId: EVENT,
      organizerId: ORGANISER,
      status: 'valid',
    });
  }

  await test('a queued scan is written with the time the person walked in', async () => {
    /*
     * A door reconnecting at midnight must not stamp an eight o'clock rush as midnight —
     * the arrival curve is the number the organiser staffs the next event from.
     */
    await seed();
    const walkedIn = '2026-09-01T20:04:00.000Z';

    const outcome = await sync.applyOfflineRedemptions(EVENT, ORGANISER, [
      { ticketId: 't-1', reference: 'TR-0001', eventId: EVENT, at: walkedIn, deviceId: 'door-a' },
    ]);

    assert.equal(outcome?.applied, 1);
    const after = await db.collection('tickets').doc('t-1').get();
    assert.equal(after.data()?.status, 'redeemed');
    assert.equal(after.data()?.redeemedAt, walkedIn);
  });

  await test('a ticket already used is reported, never overwritten', async () => {
    await seed();
    const first = '2026-09-01T20:04:00.000Z';
    const second = '2026-09-01T20:06:00.000Z';

    await sync.applyOfflineRedemptions(EVENT, ORGANISER, [
      { ticketId: 't-1', reference: 'TR-0001', eventId: EVENT, at: first, deviceId: 'door-a' },
    ]);
    const outcome = await sync.applyOfflineRedemptions(EVENT, ORGANISER, [
      { ticketId: 't-1', reference: 'TR-0001', eventId: EVENT, at: second, deviceId: 'door-b' },
    ]);

    assert.equal(outcome?.applied, 0);
    assert.equal(outcome?.conflicts.length, 1);
    assert.equal(outcome?.conflicts[0].existingAt, first);
    assert.equal(outcome?.conflicts[0].attemptedAt, second);

    // The first admission stands. Overwriting it would erase the evidence.
    const after = await db.collection('tickets').doc('t-1').get();
    assert.equal(after.data()?.redeemedAt, first);
  });

  await test('re-sending a queue that already landed changes nothing', async () => {
    await seed();
    const entry: QueuedRedemption = {
      ticketId: 't-1',
      reference: 'TR-0001',
      eventId: EVENT,
      at: '2026-09-01T20:04:00.000Z',
      deviceId: 'door-a',
    };

    await sync.applyOfflineRedemptions(EVENT, ORGANISER, [entry]);
    const retry = await sync.applyOfflineRedemptions(EVENT, ORGANISER, [entry]);

    assert.equal(retry?.applied, 0);
    assert.equal(retry?.conflicts.length, 1, 'reported, so the device can stop retrying');
  });

  await test('a door that does not own the event syncs nothing', async () => {
    await seed();
    const outcome = await sync.applyOfflineRedemptions(EVENT, 'someone-else', [
      { ticketId: 't-1', reference: 'TR-0001', eventId: EVENT, at: new Date().toISOString(), deviceId: 'x' },
    ]);
    assert.equal(outcome, null);
    assert.equal((await db.collection('tickets').doc('t-1').get()).data()?.status, 'valid');
  });

  await test('a ticket from another event in the queue is reported unknown, not applied', async () => {
    await seed();
    const outcome = await sync.applyOfflineRedemptions(EVENT, ORGANISER, [
      { ticketId: 'ghost', reference: 'TR-GHOST', eventId: EVENT, at: new Date().toISOString(), deviceId: 'x' },
    ]);
    assert.equal(outcome?.applied, 0);
    assert.deepEqual(outcome?.unknown, ['ghost']);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
