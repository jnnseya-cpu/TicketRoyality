/**
 * Public API keys and webhooks, against the Firestore emulator. `npm run test:api`
 *
 * Two things are being defended. A key is a credential somebody will paste into a CI
 * config and forget, so the store must be useless to whoever reads it. And a webhook is
 * a POST arriving at a customer's server claiming to be us, so the signature has to be
 * the thing that proves it — including refusing a replay of a genuine one.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';
process.env.API_KEY_SECRET ??= 'test-signing-secret';

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

let db: Firestore;
let keys: typeof import('../src/backend/services/api-keys');
let hooks: typeof import('../src/backend/services/webhooks');

async function seed() {
  for (const c of ['api_keys', 'webhook_endpoints', 'webhook_deliveries']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const withKey = (secret: string) =>
  new Request('https://example.com/api/v1/events', {
    headers: { authorization: `Bearer ${secret}` },
  });

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  keys = await import('../src/backend/services/api-keys');
  hooks = await import('../src/backend/services/webhooks');

  console.log('\nPublic API and webhooks (Firestore emulator)\n');

  /* ------------------------------------------------------------------ */
  /* Keys                                                               */
  /* ------------------------------------------------------------------ */

  await test('a new key is returned once and authenticates', async () => {
    await seed();
    const created = await keys.createKey({
      organizerId: ORG,
      name: 'CI',
      mode: 'live',
      scopes: ['events:read'],
    });
    assert.equal(created.ok, true);

    if (created.ok) {
      const caller = await keys.authenticate(withKey(created.secret));
      assert.equal(caller?.organizerId, ORG);
      assert.equal(caller?.mode, 'live');
    }
  });

  await test('the key itself is never stored', async () => {
    /*
     * A leaked database of plaintext keys is a leaked database of everybody's ticket
     * data, and the owners could not detect it — the keys keep working.
     */
    await seed();
    const created = await keys.createKey({
      organizerId: ORG,
      name: 'CI',
      mode: 'live',
      scopes: [],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const snap = await db.collection('api_keys').get();
    const stored = JSON.stringify(snap.docs[0].data());
    assert.equal(stored.includes(created.secret), false, 'the secret must not be in the document');
    assert.ok(stored.includes('hash'));
  });

  await test('the dashboard listing never carries the hash either', async () => {
    await seed();
    await keys.createKey({ organizerId: ORG, name: 'CI', mode: 'live', scopes: [] });

    const listed = await keys.listKeys(ORG);
    assert.equal(listed.length, 1);
    assert.equal('hash' in listed[0], false);
    // Enough to recognise the key in a list, not enough to use it.
    assert.ok(listed[0].hint.startsWith('tr_live_'));
  });

  await test('a made-up key authenticates as nobody', async () => {
    await seed();
    assert.equal(await keys.authenticate(withKey('tr_live_nonsense')), null);
    assert.equal(await keys.authenticate(new Request('https://example.com/')), null);
  });

  await test('a revoked key stops working but stays on the record', async () => {
    await seed();
    const created = await keys.createKey({
      organizerId: ORG,
      name: 'CI',
      mode: 'live',
      scopes: [],
    });
    if (!created.ok) throw new Error('setup failed');

    assert.equal(await keys.revokeKey(created.id, ORG), true);
    assert.equal(await keys.authenticate(withKey(created.secret)), null);
    // "Which key was this and when did we turn it off" is the first question after an
    // incident, and a deleted row cannot answer it.
    assert.equal((await db.collection('api_keys').get()).size, 1);
  });

  await test('somebody else cannot revoke your key', async () => {
    await seed();
    const created = await keys.createKey({
      organizerId: ORG,
      name: 'CI',
      mode: 'live',
      scopes: [],
    });
    if (!created.ok) throw new Error('setup failed');

    assert.equal(await keys.revokeKey(created.id, OTHER), false);
    assert.ok(await keys.authenticate(withKey(created.secret)));
  });

  await test('a test key is a different key, not a flag on a live one', async () => {
    await seed();
    const test = await keys.createKey({
      organizerId: ORG,
      name: 'Sandbox',
      mode: 'test',
      scopes: ['events:read'],
    });
    if (!test.ok) throw new Error('setup failed');

    assert.ok(test.secret.startsWith('tr_test_'));
    const caller = await keys.authenticate(withKey(test.secret));
    // A request cannot reach live data by omitting a header, because the mode is the key.
    assert.equal(caller?.mode, 'test');
  });

  /* ------------------------------------------------------------------ */
  /* Webhook endpoints                                                  */
  /* ------------------------------------------------------------------ */

  await test('an https endpoint is accepted and given its own secret', async () => {
    await seed();
    const created = await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://example.com/hooks',
      events: ['order.completed'],
    });
    assert.equal(created.ok, true);
    if (created.ok) assert.ok(created.secret.startsWith('whsec_'));
  });

  await test('a plain http endpoint is refused', async () => {
    await seed();
    const result = await hooks.createEndpoint({
      organizerId: ORG,
      url: 'http://example.com/hooks',
      events: [],
    });
    assert.equal(result.ok, false);
  });

  await test('an endpoint pointing inside our own network is refused', async () => {
    /*
     * We POST to these on a schedule from inside our own network. Pointed at localhost or
     * the cloud metadata address, a webhook endpoint becomes a request-forgery tool aimed
     * at us.
     */
    await seed();
    for (const url of [
      'https://localhost/hooks',
      'https://127.0.0.1/hooks',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.5/hooks',
      'https://192.168.1.1/hooks',
      'https://metadata.internal/hooks',
    ]) {
      const result = await hooks.createEndpoint({ organizerId: ORG, url, events: [] });
      assert.equal(result.ok, false, `${url} should have been refused`);
    }
  });

  await test('the endpoint listing never carries the signing secret', async () => {
    await seed();
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://example.com/hooks',
      events: ['order.completed'],
    });

    const listed = await hooks.listEndpoints(ORG);
    assert.equal('secret' in listed[0], false);
  });

  /* ------------------------------------------------------------------ */
  /* Signing                                                            */
  /* ------------------------------------------------------------------ */

  await test('a genuine signature verifies', async () => {
    const body = JSON.stringify({ type: 'order.completed' });
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const header = `t=${t},v1=${hooks.signPayload('whsec_x', body, t)}`;

    assert.equal(hooks.verifySignature('whsec_x', body, header, now), true);
  });

  await test('a tampered body fails', async () => {
    const body = JSON.stringify({ amount: 10 });
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const header = `t=${t},v1=${hooks.signPayload('whsec_x', body, t)}`;

    assert.equal(hooks.verifySignature('whsec_x', JSON.stringify({ amount: 1000 }), header, now), false);
  });

  await test('the wrong secret fails', async () => {
    const body = '{}';
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const header = `t=${t},v1=${hooks.signPayload('whsec_x', body, t)}`;

    assert.equal(hooks.verifySignature('whsec_y', body, header, now), false);
  });

  await test('a captured delivery cannot be replayed tomorrow', async () => {
    // Which is why the timestamp is signed alongside the body rather than just sent.
    const body = '{}';
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const header = `t=${t},v1=${hooks.signPayload('whsec_x', body, t)}`;

    assert.equal(hooks.verifySignature('whsec_x', body, header, now + 86_400_000), false);
  });

  await test('a malformed signature header fails rather than throwing', async () => {
    assert.equal(hooks.verifySignature('whsec_x', '{}', 'nonsense'), false);
    assert.equal(hooks.verifySignature('whsec_x', '{}', ''), false);
  });

  /* ------------------------------------------------------------------ */
  /* Queueing                                                           */
  /* ------------------------------------------------------------------ */

  await test('an event is queued for every endpoint that asked for it', async () => {
    await seed();
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://a.example.com/hooks',
      events: ['order.completed'],
    });
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://b.example.com/hooks',
      events: ['order.completed', 'ticket.refunded'],
    });
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://c.example.com/hooks',
      events: ['ticket.refunded'],
    });

    assert.equal(await hooks.queueEvent(ORG, 'order.completed', { id: 't1' }), 2);
  });

  await test('one organiser’s event never reaches another’s endpoint', async () => {
    await seed();
    await hooks.createEndpoint({
      organizerId: OTHER,
      url: 'https://other.example.com/hooks',
      events: ['order.completed'],
    });

    assert.equal(await hooks.queueEvent(ORG, 'order.completed', { id: 't1' }), 0);
  });

  await test('a delivery whose endpoint has been deleted is recorded, not left pending', async () => {
    await seed();
    const created = await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://example.com/hooks',
      events: ['order.completed'],
    });
    if (!created.ok) throw new Error('setup failed');

    await hooks.queueEvent(ORG, 'order.completed', { id: 't1' });
    await hooks.deleteEndpoint(created.id, ORG);
    await hooks.deliverDue();

    const snap = await db.collection('webhook_deliveries').get();
    assert.equal(snap.docs[0].data().status, 'orphaned');
  });

  await test('a failed delivery is retried later rather than dropped', async () => {
    // example.invalid cannot resolve, so this exercises the failure path without a network.
    await seed();
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://nothing.example.invalid/hooks',
      events: ['order.completed'],
    });
    await hooks.queueEvent(ORG, 'order.completed', { id: 't1' });

    const result = await hooks.deliverDue();
    assert.equal(result.failed, 1);

    const snap = await db.collection('webhook_deliveries').get();
    const delivery = snap.docs[0].data();
    assert.equal(delivery.status, 'pending', 'still queued for another attempt');
    assert.equal(delivery.attempts, 1);
    assert.ok(delivery.nextAttemptAt > new Date().toISOString(), 'backed off into the future');
  });

  await test('the delivery log shows the organiser what we sent', async () => {
    await seed();
    await hooks.createEndpoint({
      organizerId: ORG,
      url: 'https://nothing.example.invalid/hooks',
      events: ['order.completed'],
    });
    await hooks.queueEvent(ORG, 'order.completed', { id: 't1' });

    const log = await hooks.recentDeliveries(ORG);
    assert.equal(log.length, 1);
    assert.equal(log[0].type, 'order.completed');
  });

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
