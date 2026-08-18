/**
 * Session registration tests, against the Firestore emulator. `npm run test:sessions`
 *
 * A workshop holding thirty inside a conference that sold nine hundred is
 * oversubscribed within minutes of the agenda going out, so the assertions are about the
 * capacity number staying true under exactly that pressure — and about the clash rule,
 * which is what stops a place being taken by somebody who cannot possibly turn up.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import type { EventSession } from '../src/shared/types';

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

const EVENT = 'event-sessions';
const USER = 'user-1';

let db: Firestore;
let sessions: typeof import('../src/backend/services/sessions');

const DAY = '2026-11-12';

async function seed(capacity: number | null = 2) {
  for (const c of ['events', 'tickets', 'session_registrations', 'session_checkins']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db
    .collection('events')
    .doc(EVENT)
    .set({
      title: 'Midlands Tech Summit',
      date: `${DAY}T09:00:00.000Z`,
      organizerId: 'org-1',
      ticketTiers: [
        { id: 'standard', name: 'Standard', price: 245, quantity: 900, sold: 0 },
        { id: 'workshop-pass', name: 'Workshop pass', price: 445, quantity: 100, sold: 0 },
      ],
      sessions: [
        {
          id: 'keynote',
          title: 'Opening keynote',
          start: `${DAY}T09:00:00.000Z`,
          end: `${DAY}T10:00:00.000Z`,
          capacity: null,
          allowedTierIds: [],
        },
        {
          id: 'workshop-a',
          title: 'Workshop A',
          start: `${DAY}T11:00:00.000Z`,
          end: `${DAY}T12:30:00.000Z`,
          capacity,
          allowedTierIds: [],
        },
        {
          id: 'workshop-b',
          title: 'Workshop B',
          start: `${DAY}T12:00:00.000Z`,
          end: `${DAY}T13:00:00.000Z`,
          capacity: 10,
          allowedTierIds: [],
        },
        {
          id: 'after-a',
          title: 'Straight after A',
          start: `${DAY}T12:30:00.000Z`,
          end: `${DAY}T13:30:00.000Z`,
          capacity: 10,
          allowedTierIds: [],
        },
        {
          id: 'pass-only',
          title: 'Pass holders only',
          start: `${DAY}T15:00:00.000Z`,
          end: `${DAY}T16:00:00.000Z`,
          capacity: 10,
          allowedTierIds: ['workshop-pass'],
        },
      ],
    });
}

async function ticket(id: string, overrides: Record<string, unknown> = {}) {
  await db.collection('tickets').doc(id).set({
    reference: `TR-${id}`,
    eventId: EVENT,
    userId: USER,
    tierId: 'standard',
    status: 'valid',
    attendeeName: 'Ada Lovelace',
    ...overrides,
  });
}

async function session(id: string): Promise<EventSession> {
  const snap = await db.collection('events').doc(EVENT).get();
  return (snap.data()?.sessions as EventSession[]).find((s) => s.id === id)!;
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  sessions = await import('../src/backend/services/sessions');

  console.log('\nSessions (Firestore emulator)\n');

  await test('a ticket holder takes a place, and the count moves', async () => {
    await seed();
    await ticket('t-1');
    const result = await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    assert.equal(result.ok, true);
    assert.equal((await session('workshop-a')).registered, 1);
  });

  await test('a full workshop refuses the next person', async () => {
    await seed(1);
    await ticket('t-1');
    await ticket('t-2', { userId: 'user-2' });

    assert.equal((await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER)).ok, true);
    const second = await sessions.registerForSession(EVENT, 'workshop-a', 't-2', 'user-2');
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.kind, 'full');
  });

  await test('two people going for the last place: exactly one gets it', async () => {
    /*
     * The moment the agenda goes out. A read-then-write would let both see "one left".
     */
    await seed(1);
    await ticket('t-1');
    await ticket('t-2', { userId: 'user-2' });

    const [a, b] = await Promise.all([
      sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER),
      sessions.registerForSession(EVENT, 'workshop-a', 't-2', 'user-2'),
    ]);

    assert.equal([a.ok, b.ok].filter(Boolean).length, 1, 'exactly one may succeed');
    assert.equal((await session('workshop-a')).registered, 1);
  });

  await test('registering twice is refused, and does not take two places', async () => {
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    const again = await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);

    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.kind, 'already');
    assert.equal((await session('workshop-a')).registered, 1);
  });

  await test('an overlapping session is refused', async () => {
    // Workshop B starts before A finishes. Booking both means one room keeps a chair
    // warm for somebody who cannot be in it.
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);

    const clash = await sessions.registerForSession(EVENT, 'workshop-b', 't-1', USER);
    assert.equal(clash.ok, false);
    if (!clash.ok) assert.equal(clash.kind, 'clash');
    assert.equal((await session('workshop-b')).registered ?? 0, 0);
  });

  await test('a session starting exactly when another ends is not a clash', async () => {
    // Otherwise a full day of back-to-back sessions is unbookable after the first one.
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    assert.equal((await sessions.registerForSession(EVENT, 'after-a', 't-1', USER)).ok, true);
  });

  await test('a tier that is not included cannot reserve a place', async () => {
    await seed();
    await ticket('t-1', { tierId: 'standard' });
    const result = await sessions.registerForSession(EVENT, 'pass-only', 't-1', USER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'wrong-tier');
  });

  await test('the tier that is included can', async () => {
    await seed();
    await ticket('t-pass', { tierId: 'workshop-pass' });
    assert.equal((await sessions.registerForSession(EVENT, 'pass-only', 't-pass', USER)).ok, true);
  });

  await test('somebody else’s ticket cannot be used to take a place', async () => {
    // The cheapest denial of service against a conference: fill every workshop with
    // tickets you do not hold.
    await seed();
    await ticket('t-1', { userId: 'someone-else' });
    const result = await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'no-ticket');
  });

  await test('a refunded ticket cannot hold a place', async () => {
    await seed();
    await ticket('t-1', { status: 'refunded' });
    assert.equal((await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER)).ok, false);
  });

  await test('a ticket for a different event is refused', async () => {
    await seed();
    await ticket('t-1', { eventId: 'some-other-event' });
    assert.equal((await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER)).ok, false);
  });

  await test('an uncapped keynote books nobody and counts nothing', async () => {
    /*
     * There is nothing to reserve, so incrementing a number with no bound would produce
     * a figure that looks like capacity and is not.
     */
    await seed();
    await ticket('t-1');
    const result = await sessions.registerForSession(EVENT, 'keynote', 't-1', USER);
    assert.equal(result.ok, true);
    assert.equal((await session('keynote')).registered, undefined);
  });

  await test('releasing a place gives it back to somebody else', async () => {
    await seed(1);
    await ticket('t-1');
    await ticket('t-2', { userId: 'user-2' });

    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    assert.equal((await sessions.registerForSession(EVENT, 'workshop-a', 't-2', 'user-2')).ok, false);

    assert.equal(await sessions.cancelSessionRegistration(EVENT, 'workshop-a', 't-1', USER), true);
    assert.equal((await session('workshop-a')).registered, 0);
    assert.equal((await sessions.registerForSession(EVENT, 'workshop-a', 't-2', 'user-2')).ok, true);
  });

  await test('somebody else cannot release your place', async () => {
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);

    assert.equal(await sessions.cancelSessionRegistration(EVENT, 'workshop-a', 't-1', 'user-2'), false);
    assert.equal((await session('workshop-a')).registered, 1);
  });

  await test('cancelling twice does not invent a place', async () => {
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);

    assert.equal(await sessions.cancelSessionRegistration(EVENT, 'workshop-a', 't-1', USER), true);
    assert.equal(await sessions.cancelSessionRegistration(EVENT, 'workshop-a', 't-1', USER), false);
    assert.equal((await session('workshop-a')).registered, 0);
  });

  await test('an attendee sees their own agenda, and the organiser sees the room', async () => {
    await seed();
    await ticket('t-1');
    await sessions.registerForSession(EVENT, 'workshop-a', 't-1', USER);
    // `after-a`, not `pass-only` — a standard ticket is correctly refused that one, and
    // an assertion that depends on a refusal not happening is testing the wrong thing.
    await sessions.registerForSession(EVENT, 'after-a', 't-1', USER);

    const mine = await sessions.agendaFor('t-1');
    assert.equal(mine.length, 2);
    assert.ok(mine.includes('workshop-a'));

    const room = await sessions.attendeesFor(EVENT, 'workshop-a');
    assert.equal(room.length, 1);
    assert.equal(room[0].ticketId, 't-1');
  });

  /* ------------------------------------------------------------------ */
  /* Check-in — they turned up (the conferences card's "Not yet")        */
  /* ------------------------------------------------------------------ */

  await test('a redeemed ticket checks into an uncapped session', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed' });

    const result = await sessions.checkInToSession(EVENT, 'keynote', 't1', 'door-1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.sessionTitle, 'Opening keynote');
      assert.equal(result.checkedIn, 1);
    }
  });

  await test('checking in twice reports the first time, and counts once', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed' });
    await sessions.checkInToSession(EVENT, 'keynote', 't1', 'door-1');

    const again = await sessions.checkInToSession(EVENT, 'keynote', 't1', 'door-2');
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.kind, 'already');

    const count = await db.collection('session_checkins').get();
    assert.equal(count.size, 1);
  });

  await test('a capped session refuses a ticket with no reservation', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed' });

    const result = await sessions.checkInToSession(EVENT, 'workshop-a', 't1', 'door-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'not-registered');
  });

  await test('a reserved place checks in, and check-in does not consume the ticket', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed' });
    await sessions.registerForSession(EVENT, 'workshop-a', 't1', USER);

    const result = await sessions.checkInToSession(EVENT, 'workshop-a', 't1', 'door-1');
    assert.equal(result.ok, true);

    const stored = (await db.collection('tickets').doc('t1').get()).data()!;
    assert.equal(stored.status, 'redeemed'); // untouched — check-in is not redemption
  });

  await test('a ticket for another event cannot check in here', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed', eventId: 'someone-elses-event' });

    const result = await sessions.checkInToSession(EVENT, 'keynote', 't1', 'door-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'no-ticket');
  });

  await test('sessionsAttended lists exactly what was scanned, in order', async () => {
    await seed();
    await ticket('t1', { status: 'redeemed' });
    await sessions.registerForSession(EVENT, 'workshop-a', 't1', USER);
    await sessions.checkInToSession(EVENT, 'keynote', 't1', 'door-1');
    await sessions.checkInToSession(EVENT, 'workshop-a', 't1', 'door-1');

    const attended = await sessions.sessionsAttended('t1');
    assert.deepEqual(
      attended.map((a) => a.sessionId),
      ['keynote', 'workshop-a']
    );
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
