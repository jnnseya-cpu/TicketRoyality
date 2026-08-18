/**
 * Streaming tests, against the Firestore emulator. `npm run test:streaming`
 *
 * One property matters more than the rest: **the embed URL must not be returned to
 * anybody without a valid ticket**. Everything else here — replay windows, doors, chat
 * rate limits — is behaviour. That one is the feature.
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

const EVENT = 'event-stream';
const ORGANISER = 'org-1';
const HOLDER = 'user-holder';
const STRANGER = 'user-stranger';
const LIVE_URL = 'https://player.example.com/live/secret-embed';
const REPLAY_URL = 'https://player.example.com/replay/secret-embed';

let db: Firestore;
let streaming: typeof import('../src/backend/services/streaming');

async function seed(
  eventDate: string,
  stream: Record<string, unknown> = {},
  ticket: Record<string, unknown> | null = { status: 'valid' }
) {
  for (const c of ['events', 'tickets', 'stream_views', 'stream_chat']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await db
    .collection('events')
    .doc(EVENT)
    .set({
      title: 'Global AI Livestream',
      date: eventDate,
      organizerId: ORGANISER,
      streamDetails: { streamUrl: LIVE_URL, chatEnabled: true, ...stream },
    });

  if (ticket) {
    await db.collection('tickets').doc('t-1').set({
      reference: 'TR-STREAM-1',
      eventId: EVENT,
      organizerId: ORGANISER,
      userId: HOLDER,
      attendeeName: 'Ada Lovelace',
      ...ticket,
    });
  }
}

const NOW = Date.now();
const STARTED = new Date(NOW - 60 * 60_000).toISOString();
const SOON = new Date(NOW + 5 * 60_000).toISOString();
const FAR_OFF = new Date(NOW + 5 * 86_400_000).toISOString();

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  streaming = await import('../src/backend/services/streaming');

  console.log('\nStreaming (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* The URL                                                            */
  /* ------------------------------------------------------------------ */

  await test('a ticket holder gets the stream address', async () => {
    await seed(SOON);
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, true);
    if (access.ok) assert.equal(access.streamUrl, LIVE_URL);
  });

  await test('somebody without a ticket never receives the address', async () => {
    /*
     * The whole feature. If this ever fails, the stream is public and the ticket is
     * decoration.
     */
    await seed(SOON);
    const access = await streaming.streamAccessFor(EVENT, STRANGER);
    assert.equal(access.ok, false);
    if (!access.ok) assert.equal(access.reason, 'no-ticket');
    assert.ok(!JSON.stringify(access).includes('secret-embed'), 'the URL must not leak in a refusal');
  });

  await test('a refunded ticket loses access', async () => {
    await seed(SOON, {}, { status: 'refunded' });
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, false);
  });

  await test('a redeemed ticket keeps access', async () => {
    // Somebody who came to the room and left early paid for the whole thing.
    await seed(SOON, {}, { status: 'redeemed' });
    assert.equal((await streaming.streamAccessFor(EVENT, HOLDER)).ok, true);
  });

  await test('an event with no stream says so rather than half-opening', async () => {
    await seed(SOON);
    await db.collection('events').doc(EVENT).update({ streamDetails: null });
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, false);
    if (!access.ok) assert.equal(access.reason, 'not-a-stream');
  });

  /* ------------------------------------------------------------------ */
  /* Doors and replays                                                  */
  /* ------------------------------------------------------------------ */

  await test('the player does not open days early, and says when it will', async () => {
    // The link being loose in the world for a week before anyone watches is the risk.
    await seed(FAR_OFF);
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.reason, 'too-early');
      assert.ok(access.opensAt, 'a countdown needs a time, not just a refusal');
    }
  });

  await test('the door opens the configured number of minutes before', async () => {
    await seed(new Date(NOW + 20 * 60_000).toISOString(), { openMinutesBefore: 30 });
    assert.equal((await streaming.streamAccessFor(EVENT, HOLDER)).ok, true);
  });

  await test('after the event the replay is served instead of the live embed', async () => {
    await seed(STARTED, { replayUrl: REPLAY_URL });
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, true);
    if (access.ok) {
      assert.equal(access.streamUrl, REPLAY_URL);
      assert.equal(access.isReplay, true);
    }
  });

  await test('an expired replay returns nothing, not the live link', async () => {
    await seed(STARTED, {
      replayUrl: REPLAY_URL,
      replayUntil: new Date(NOW - 60_000).toISOString(),
    });
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, false);
    if (!access.ok) assert.equal(access.reason, 'ended');
  });

  await test('an event with no replay stays on the live embed after it starts', async () => {
    await seed(STARTED);
    const access = await streaming.streamAccessFor(EVENT, HOLDER);
    assert.equal(access.ok, true);
    if (access.ok) assert.equal(access.isReplay, false);
  });

  /* ------------------------------------------------------------------ */
  /* Audience                                                           */
  /* ------------------------------------------------------------------ */

  await test('views count distinct tickets, and opens per ticket', async () => {
    await seed(SOON);
    await streaming.recordStreamView(EVENT, 't-1', HOLDER);
    await streaming.recordStreamView(EVENT, 't-1', HOLDER);
    await streaming.recordStreamView(EVENT, 't-2', 'someone-else');

    const audience = await streaming.streamAudience(EVENT);
    assert.equal(audience.viewers, 2, 'two tickets watched');
    assert.equal(audience.opens, 3, 'one of them opened it twice');
  });

  /* ------------------------------------------------------------------ */
  /* Chat                                                               */
  /* ------------------------------------------------------------------ */

  await test('a ticket holder can post', async () => {
    await seed(SOON);
    const result = await streaming.postChatMessage(EVENT, HOLDER, 'Hello from Lagos');
    assert.equal(result.ok, true);
  });

  await test('the display name comes from the ticket, not the request', async () => {
    // Otherwise anybody posts as the organiser.
    await seed(SOON);
    await streaming.postChatMessage(EVENT, HOLDER, 'Hello');
    const messages = await db.collection('stream_chat').where('eventId', '==', EVENT).get();
    assert.equal(messages.docs[0].data().name, 'Ada Lovelace');
  });

  await test('somebody without a ticket cannot post', async () => {
    await seed(SOON);
    const result = await streaming.postChatMessage(EVENT, STRANGER, 'let me in');
    assert.equal(result.ok, false);
  });

  await test('chat off means nobody posts, holder or not', async () => {
    await seed(SOON, { chatEnabled: false });
    assert.equal((await streaming.postChatMessage(EVENT, HOLDER, 'hi')).ok, false);
  });

  await test('posting twice in a second is throttled', async () => {
    await seed(SOON);
    await streaming.postChatMessage(EVENT, HOLDER, 'one');
    const second = await streaming.postChatMessage(EVENT, HOLDER, 'two');
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.status, 429);
  });

  await test('an empty message is refused rather than posted blank', async () => {
    await seed(SOON);
    assert.equal((await streaming.postChatMessage(EVENT, HOLDER, '   ')).ok, false);
  });

  await test('the organiser can hide a message, and it is hidden not destroyed', async () => {
    // Moderation stays auditable: a deleted message cannot be reviewed later.
    await seed(SOON);
    const posted = await streaming.postChatMessage(EVENT, HOLDER, 'something regrettable');
    if (!posted.ok) throw new Error('setup failed');

    assert.equal(await streaming.hideChatMessage(posted.id, EVENT, ORGANISER), true);
    const doc = await db.collection('stream_chat').doc(posted.id).get();
    assert.equal(doc.exists, true);
    assert.equal(doc.data()?.hidden, true);
  });

  await test('somebody else cannot moderate an organiser’s chat', async () => {
    await seed(SOON);
    const posted = await streaming.postChatMessage(EVENT, HOLDER, 'fine message');
    if (!posted.ok) throw new Error('setup failed');
    assert.equal(await streaming.hideChatMessage(posted.id, EVENT, 'someone-else'), false);
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
