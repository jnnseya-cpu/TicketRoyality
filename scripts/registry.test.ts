/**
 * Gift registry, against the Firestore emulator. `npm run test:registry`
 *
 * The failure a registry has to prevent is a couple thanking somebody for a gift the list
 * forgot — so the assertions are about the running total never losing a contribution, never
 * counting one twice, and never letting two guests buy the same thing.
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

const EVENT = 'event-wedding';
const ORG = 'org-1';

let db: Firestore;
let registry: typeof import('../src/backend/services/registry');

async function seed() {
  for (const c of ['registry_items', 'registry_contributions']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const item = (over: Partial<Parameters<typeof registry.createItem>[0]> = {}) =>
  registry.createItem({
    eventId: EVENT,
    organizerId: ORG,
    title: 'Stand mixer',
    targetMinor: 40_000,
    ...over,
  });

const give = (
  itemId: string,
  amountMinor: number,
  providerEventId = `evt_${amountMinor}_${Math.round(amountMinor / 7)}`
) =>
  registry.recordContribution({
    providerEventId,
    itemId,
    amountMinor,
    giverName: 'Ada Lovelace',
    giverEmail: 'ada@example.com',
  });

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  registry = await import('../src/backend/services/registry');

  console.log('\nGift registry (Firestore emulator)\n');

  await test('a contribution moves the running total', async () => {
    await seed();
    const id = (await item())!;

    const result = await give(id, 10_000, 'evt_a');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.raisedMinor, 10_000);
      assert.equal(result.funded, false);
    }
  });

  await test('two guests giving at the same instant both count', async () => {
    /*
     * The lost-update case. On a registry it means a couple thanking somebody for a gift
     * the list has no record of, which is worse than a wrong number.
     */
    await seed();
    const id = (await item())!;

    await Promise.all([give(id, 10_000, 'evt_a'), give(id, 15_000, 'evt_b')]);

    const stored = (await db.collection('registry_items').doc(id).get()).data()!;
    assert.equal(stored.raisedMinor, 25_000);
    assert.equal(stored.contributionCount, 2);
  });

  await test('a redelivered payment does not count twice', async () => {
    await seed();
    const id = (await item())!;

    assert.equal((await give(id, 10_000, 'evt_same')).ok, true);
    const again = await give(id, 10_000, 'evt_same');
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.reason, 'duplicate');

    const stored = (await db.collection('registry_items').doc(id).get()).data()!;
    assert.equal(stored.raisedMinor, 10_000);
  });

  await test('the last contribution marks the gift funded', async () => {
    await seed();
    const id = (await item())!;
    await give(id, 30_000, 'evt_a');

    const result = await give(id, 10_000, 'evt_b');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.funded, true);
  });

  await test('a gift already bought cannot be bought again', async () => {
    await seed();
    const id = (await item())!;
    await give(id, 40_000, 'evt_a');

    const late = await give(id, 5_000, 'evt_b');
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.reason, 'funded');
  });

  await test('more than is left is refused rather than trimmed', async () => {
    // Taking £80 towards a £30 balance and keeping the difference is not a decision to
    // make on somebody's behalf.
    await seed();
    const id = (await item())!;
    await give(id, 37_000, 'evt_a');

    const over = await give(id, 8_000, 'evt_b');
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.reason, 'too-much');
  });

  await test('an all-or-nothing gift refuses a part payment', async () => {
    await seed();
    const id = (await item({ allowPartial: false, targetMinor: 10_000 }))!;

    const part = await give(id, 3_000, 'evt_a');
    assert.equal(part.ok, false);
    if (!part.ok) assert.equal(part.reason, 'partial-not-allowed');

    assert.equal((await give(id, 10_000, 'evt_b')).ok, true);
  });

  await test('a gift that no longer exists is refused', async () => {
    await seed();
    const result = await give('no-such-item', 1_000, 'evt_a');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-item');
  });

  await test('unfunded gifts are listed first, so the list looks givable', async () => {
    await seed();
    const done = (await item({ title: 'Aaa bought' }))!;
    await item({ title: 'Zzz still needed' });
    await give(done, 40_000, 'evt_a');

    const items = await registry.itemsFor(EVENT);
    assert.equal(items[0].title, 'Zzz still needed');
  });

  await test('a registry belongs to its own event', async () => {
    await seed();
    await item();
    await item({ eventId: 'another-wedding' });
    assert.equal((await registry.itemsFor(EVENT)).length, 1);
  });

  await test('the organiser can see who gave what, for the thank-you letters', async () => {
    await seed();
    const id = (await item())!;
    await give(id, 10_000, 'evt_a');

    const list = await registry.contributionsFor(ORG);
    assert.equal(list.length, 1);
    assert.equal(list[0].giverEmail, 'ada@example.com');
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
