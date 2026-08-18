/**
 * Wristband tests, against the Firestore emulator. `npm run test:wristbands`
 *
 * A band is a bearer token — that is what a wristband has always been — so the assertions
 * are about the bindings staying one-to-one in both directions. One tag admitting two
 * people, or one ticket wearing two live bands, are the two ways this becomes a way in.
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

const EVENT = 'event-bands';
const ORGANISER = 'org-1';
const TAG = '04A2B7C1D5';

let db: Firestore;
let bands: typeof import('../src/backend/services/wristbands');

async function seed() {
  for (const c of ['events', 'tickets', 'users', 'wristbands', 'blocklist']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db.collection('events').doc(EVENT).set({ title: 'Warehouse', organizerId: ORGANISER });
  await db.collection('users').doc(ORGANISER).set({ userType: 'organiser' });

  for (const [id, reference] of [
    ['t-1', 'TR-0001'],
    ['t-2', 'TR-0002'],
  ]) {
    await db.collection('tickets').doc(id).set({
      reference,
      eventId: EVENT,
      organizerId: ORGANISER,
      userId: `user-${id}`,
      attendeeName: 'Ada Lovelace',
      attendeeEmail: `${id}@example.com`,
      tierName: 'General',
      status: 'valid',
    });
  }
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  bands = await import('../src/backend/services/wristbands');

  console.log('\nWristbands (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Reading a tag                                                      */
  /* ------------------------------------------------------------------ */

  await test('tags normalise, so the door does not care which reader was bought', async () => {
    // Readers differ on case, colons and dashes for the same physical tag.
    assert.equal(bands.normaliseTag('04:a2:b7:c1'), '04A2B7C1');
    assert.equal(bands.normaliseTag(' 04-A2-B7-C1 '), '04A2B7C1');
    assert.equal(bands.normaliseTag('04a2b7c1'), '04A2B7C1');
  });

  /* ------------------------------------------------------------------ */
  /* Binding                                                            */
  /* ------------------------------------------------------------------ */

  await test('a band binds to a ticket by its printed reference', async () => {
    await seed();
    const result = await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.reference, 'TR-0001');
  });

  await test('one tag cannot be bound to a second ticket', async () => {
    // Otherwise one band admits two people, which is the whole risk.
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    const second = await bands.bindTag(EVENT, TAG, 'TR-0002', ORGANISER);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.kind, 'tag-taken');
  });

  await test('the same tag in a different format is still the same tag', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    const second = await bands.bindTag(EVENT, '04:a2:b7:c1:d5', 'TR-0002', ORGANISER);
    assert.equal(second.ok, false, 'formatting must not open a second binding');
  });

  await test('one ticket cannot wear two live bands', async () => {
    // A lost band replaced without releasing the old one leaves two ways in.
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    const second = await bands.bindTag(EVENT, 'BB99FF00', 'TR-0001', ORGANISER);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.kind, 'already-bound');
  });

  await test('releasing a band frees both the tag and the ticket', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    assert.equal(await bands.unbindTag(EVENT, TAG, ORGANISER), true);
    assert.equal((await bands.bindTag(EVENT, TAG, 'TR-0002', ORGANISER)).ok, true);
  });

  await test('a refunded ticket cannot be given a band', async () => {
    await seed();
    await db.collection('tickets').doc('t-1').update({ status: 'refunded' });
    assert.equal((await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER)).ok, false);
  });

  await test('an unknown reference is refused rather than guessed', async () => {
    await seed();
    const result = await bands.bindTag(EVENT, TAG, 'TR-NOPE', ORGANISER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'no-ticket');
  });

  await test('somebody else cannot issue bands on your event', async () => {
    await seed();
    const result = await bands.bindTag(EVENT, TAG, 'TR-0001', 'someone-else');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'not-yours');
  });

  /* ------------------------------------------------------------------ */
  /* The door                                                           */
  /* ------------------------------------------------------------------ */

  await test('a bound band admits, once', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);

    const first = await bands.admitByTag(EVENT, TAG, ORGANISER);
    assert.equal(first.ok, true);

    const second = await bands.admitByTag(EVENT, TAG, ORGANISER);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.kind, 'already-used');
  });

  await test('two readers presenting one band at once admit exactly one person', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);

    const [a, b] = await Promise.all([
      bands.admitByTag(EVENT, TAG, ORGANISER),
      bands.admitByTag(EVENT, TAG, ORGANISER),
    ]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
  });

  await test('an unregistered band is refused', async () => {
    await seed();
    const result = await bands.admitByTag(EVENT, 'FFFFFFFF', ORGANISER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'unknown-tag');
  });

  await test('the blocklist refuses a band exactly as it refuses a QR', async () => {
    /*
     * The case the blocklist was built for: a barred person turning up with a genuine,
     * paid ticket — and a band is the most likely way they present it.
     */
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);

    const blocklist = await import('../src/backend/services/blocklist');
    await blocklist.addBlock({
      organizerId: ORGANISER,
      kind: 'email',
      value: 't-1@example.com',
      reason: 'Barred by the venue',
      createdBy: ORGANISER,
    });

    const result = await bands.admitByTag(EVENT, TAG, ORGANISER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'blocked');

    // Refused, not consumed — the same property the QR door has.
    assert.equal((await db.collection('tickets').doc('t-1').get()).data()?.status, 'valid');
  });

  await test('a door that does not own the event admits nobody', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    const result = await bands.admitByTag(EVENT, TAG, 'someone-else');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'not-yours');
  });

  await test('bands issued is countable for the organiser', async () => {
    await seed();
    await bands.bindTag(EVENT, TAG, 'TR-0001', ORGANISER);
    await bands.bindTag(EVENT, 'BB99FF00', 'TR-0002', ORGANISER);
    assert.equal(await bands.bandsIssued(EVENT), 2);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
