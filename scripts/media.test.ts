/**
 * Media library tests, against the Firestore emulator. `npm run test:media`
 *
 * The assertions here are about the two ways a media library goes wrong: one organiser
 * reading or writing into another's, and an image disappearing from under an event that
 * is actively selling tickets.
 *
 * **Not covered, deliberately**: the successful delete, because it removes the Storage
 * object first and only the Firestore emulator runs here. Everything up to that point —
 * ownership, the in-use check, the titles that come back — is exercised; the file delete
 * itself is not, and this comment exists so nobody reads a green run as more than it is.
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

const ORG = 'org-1';
const OTHER = 'org-2';
const URL = 'https://firebasestorage.googleapis.com/v0/b/x/o/events%2Forg-1%2Fa.webp';

let db: Firestore;
let media: typeof import('../src/backend/services/media');

async function seed() {
  for (const c of ['media', 'events']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

function upload(organizerId: string, overrides: Partial<Parameters<typeof media.recordUpload>[0]> = {}) {
  return media.recordUpload({
    organizerId,
    url: URL,
    path: `events/${organizerId}/a.webp`,
    name: 'poster.webp',
    width: 2000,
    height: 1125,
    bytes: 240_000,
    contentType: 'image/webp',
    ...overrides,
  });
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  media = await import('../src/backend/services/media');

  console.log('\nMedia library (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Recording an upload                                                */
  /* ------------------------------------------------------------------ */

  await test('an upload is recorded so it can be found again', async () => {
    await seed();
    const id = await upload(ORG);
    assert.ok(id, 'expected a record id');
  });

  await test('a path that does not belong to the caller is refused', async () => {
    /*
     * Storage refused it already — the rules match the uid against the folder — so this
     * only fires when the request body was edited after the upload. Recording it anyway
     * would put somebody else's file in this organiser's library, and hand them a delete
     * button for it.
     */
    await seed();
    const id = await upload(ORG, { path: `events/${OTHER}/a.webp` });
    assert.equal(id, null);
  });

  /* ------------------------------------------------------------------ */
  /* Listing                                                            */
  /* ------------------------------------------------------------------ */

  await test('a library shows only its own organiser', async () => {
    await seed();
    await upload(ORG);
    await upload(OTHER);

    assert.equal((await media.listMedia(ORG)).length, 1);
    assert.equal((await media.listMedia(OTHER)).length, 1);
  });

  await test('the newest upload comes first, because that is the one being used', async () => {
    await seed();
    await upload(ORG, { name: 'older.webp' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await upload(ORG, { name: 'newer.webp' });

    assert.equal((await media.listMedia(ORG))[0]?.name, 'newer.webp');
  });

  await test('usage totals the bytes, so an organiser can see what the library holds', async () => {
    await seed();
    await upload(ORG, { bytes: 100_000 });
    await upload(ORG, { bytes: 250_000, path: `events/${ORG}/b.webp` });

    assert.deepEqual(await media.mediaUsage(ORG), { files: 2, bytes: 350_000 });
  });

  /* ------------------------------------------------------------------ */
  /* Deleting                                                           */
  /* ------------------------------------------------------------------ */

  await test('somebody else cannot delete your image', async () => {
    await seed();
    const id = await upload(ORG);
    const result = await media.deleteMedia(id!, OTHER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not-yours');

    // Still there — a refusal must not be a partial delete.
    assert.equal((await media.listMedia(ORG)).length, 1);
  });

  await test('an image an event is using cannot be deleted', async () => {
    // The failure this prevents: a broken hero on a page that is selling tickets, found
    // out when a customer mentions it.
    await seed();
    const id = await upload(ORG);
    await db.collection('events').add({ organizerId: ORG, imageUrl: URL, status: 'published', date: '2030-01-01T19:00:00.000Z', title: 'Warehouse' });

    const result = await media.deleteMedia(id!, ORG);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'in-use');
  });

  await test('the refusal names the events, because that is what the organiser must change', async () => {
    await seed();
    const id = await upload(ORG);
    await db.collection('events').add({ organizerId: ORG, imageUrl: URL, title: 'Warehouse', status: 'published', date: '2030-01-01T19:00:00.000Z' });
    await db.collection('events').add({ organizerId: ORG, imageUrl: URL, title: 'Rooftop', status: 'published', date: '2030-01-01T19:00:00.000Z' });

    const result = await media.deleteMedia(id!, ORG);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual([...(result.usedBy ?? [])].sort(), ['Rooftop', 'Warehouse']);
    }
  });

  await test('a cancelled event does not hold a picture hostage — its reference is rewritten', async () => {
    await seed();
    const id = await upload(ORG);
    const dead = await db.collection('events').add({
      organizerId: ORG, imageUrl: URL, coverImageUrl: URL, title: 'Cancelled Gala',
      status: 'cancelled', date: '2030-01-01T19:00:00.000Z',
    });

    const result = await media.deleteMedia(id!, ORG);
    // The emulator has no Storage bucket, so the file step reports unavailable — the
    // assertion that matters is that a dead event never blocks as in-use, and that
    // its references were rewritten before the file was touched.
    if (!result.ok) assert.notEqual(result.reason, 'in-use');

    const after = (await dead.get()).data()!;
    assert.notEqual(after.imageUrl, URL, 'the dead event must fall back to a placeholder');
    assert.equal(after.coverImageUrl, '', 'the cover falls back to the picture');
  });

  await test('a past event does not block either — its page keeps a placeholder', async () => {
    await seed();
    const id = await upload(ORG);
    await db.collection('events').add({
      organizerId: ORG, imageUrl: URL, title: 'Last Year',
      status: 'published', date: '2020-01-01T19:00:00.000Z',
    });
    const result = await media.deleteMedia(id!, ORG);
    if (!result.ok) assert.notEqual(result.reason, 'in-use');
  });

  await test("another organiser's event holding the same URL does not block the delete", async () => {
    /*
     * The in-use query is scoped to the owner, so an unrelated organiser cannot pin an
     * image in place — deliberately or otherwise — by pointing an event at its URL.
     */
    await seed();
    const id = await upload(ORG);
    await db.collection('events').add({ organizerId: OTHER, imageUrl: URL, title: 'Not yours' });

    const result = await media.deleteMedia(id!, ORG);
    // Reaches the Storage delete, which has no emulator here: the point is that it is
    // no longer refused as in-use.
    if (!result.ok) assert.notEqual(result.reason, 'in-use');
  });

  await test('an id that does not exist is refused rather than treated as deleted', async () => {
    await seed();
    const result = await media.deleteMedia('no-such-image', ORG);
    assert.equal(result.ok, false);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
