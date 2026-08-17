/**
 * Attestation tests, against the Firestore emulator. `npm run test:attestation`
 *
 * Three properties carry this, and each is the way a proof-of-work gate is usually
 * defeated rather than a way it crashes:
 *
 * 1. **A client cannot mint its own challenge.** If it could, it would pick difficulty
 *    zero and the whole mechanism costs nothing.
 * 2. **A solution is single-use.** Otherwise one solved challenge is a reusable token
 *    and the cost is paid once for unlimited attempts.
 * 3. **It fails open.** This is a cost, not authentication. A datastore outage that
 *    refused every sign-up and every checkout would do the attacker's work for them.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GOOGLE_CLOUD_PROJECT ??= 'ticketroyality-test';
process.env.CRON_SECRET ??= 'test-attestation-secret';

import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';

import { leadingZeroBits, meetsDifficulty, solve } from '../src/shared/security/pow';

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

let db: Firestore;
let attest: typeof import('../src/backend/security/attestation');

/** The header a browser would send. */
function token(challenge: { nonce: string; difficulty: number; expiresAt: number; signature: string }, counter: number) {
  return Buffer.from(JSON.stringify({ ...challenge, counter })).toString('base64url');
}

async function run() {
  const admin = await import('../src/backend/firebase/admin');
  db = admin.getAdminDb();
  attest = await import('../src/backend/security/attestation');

  console.log('\nAttestation (Firestore emulator)\n');

  async function clear() {
    const snap = await db.collection('attestations').get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  /* ------------------------------------------------------------------ */
  /* The maths                                                          */
  /* ------------------------------------------------------------------ */

  await test('leading zero bits counts bits, not bytes', async () => {
    // A difficulty that could only move in steps of eight would jump from "instant" to
    // "eight seconds" with nothing usable in between.
    assert.equal(leadingZeroBits(new Uint8Array([0xff])), 0);
    assert.equal(leadingZeroBits(new Uint8Array([0x7f])), 1);
    assert.equal(leadingZeroBits(new Uint8Array([0x01])), 7);
    assert.equal(leadingZeroBits(new Uint8Array([0x00, 0x80])), 8);
    assert.equal(leadingZeroBits(new Uint8Array([0x00, 0x01])), 15);
  });

  await test('a solution actually meets the difficulty it claims', async () => {
    const solution = await solve({ nonce: 'test-nonce', difficulty: 12 });
    assert.equal(meetsDifficulty('test-nonce', solution.counter, 12), true);
  });

  await test('the same nonce and counter verify identically every time', async () => {
    // Client and server run this same function. A disagreement refuses every customer.
    const solution = await solve({ nonce: 'stable', difficulty: 10 });
    assert.equal(meetsDifficulty('stable', solution.counter, 10), true);
    assert.equal(meetsDifficulty('stable', solution.counter, 10), true);
  });

  /* ------------------------------------------------------------------ */
  /* Verification                                                       */
  /* ------------------------------------------------------------------ */

  await test('a genuine solved challenge is accepted', async () => {
    await clear();
    const challenge = attest.issueChallenge(10);
    const solution = await solve(challenge);
    assert.equal((await attest.verifyAttestation(token(challenge, solution.counter))).ok, true);
  });

  await test('a challenge the client invented is refused', async () => {
    // The whole mechanism, if this fails: pick difficulty 0 and pay nothing.
    await clear();
    const forged = { nonce: 'mine', difficulty: 0, expiresAt: Date.now() + 60_000, signature: 'nope' };
    const result = await attest.verifyAttestation(token(forged, 0));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'forged');
  });

  await test('a client cannot lower the difficulty of a real challenge', async () => {
    await clear();
    const challenge = attest.issueChallenge(20);
    // Same nonce and signature, easier difficulty — the signature covers all three.
    const tampered = { ...challenge, difficulty: 1 };
    const result = await attest.verifyAttestation(token(tampered, 0));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'forged');
  });

  await test('a solution that did not do the work is refused', async () => {
    await clear();
    const challenge = attest.issueChallenge(20);
    const result = await attest.verifyAttestation(token(challenge, 1));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'insufficient');
  });

  await test('an expired challenge is refused', async () => {
    await clear();
    const challenge = attest.issueChallenge(10);
    const solution = await solve(challenge);
    const stale = { ...challenge, expiresAt: Date.now() - 1000 };
    // Re-sign is impossible from the client side, so an expired one also reads as
    // forged; what matters is that it does not verify.
    assert.equal((await attest.verifyAttestation(token(stale, solution.counter))).ok, false);
  });

  await test('a solved challenge cannot be used twice', async () => {
    /*
     * Without this the cost is paid once and the token is reusable forever, which is
     * exactly the property the whole mechanism exists to create.
     */
    await clear();
    const challenge = attest.issueChallenge(10);
    const solution = await solve(challenge);
    const header = token(challenge, solution.counter);

    assert.equal((await attest.verifyAttestation(header)).ok, true);
    const replay = await attest.verifyAttestation(header);
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.reason, 'replayed');
  });

  await test('the nonce is burned even when the work was wrong', async () => {
    // Otherwise a valid nonce can be hammered with guessed counters for free.
    await clear();
    const challenge = attest.issueChallenge(20);
    await attest.verifyAttestation(token(challenge, 1));

    const spent = await db.collection('attestations').doc(challenge.nonce).get();
    assert.equal(spent.exists, true, 'a probed nonce must be spent');
  });

  await test('rubbish in the header is refused rather than thrown', async () => {
    assert.equal((await attest.verifyAttestation('not-base64-{{')).ok, false);
    assert.equal((await attest.verifyAttestation('')).ok, false);
    assert.equal((await attest.verifyAttestation(null)).ok, false);
  });

  await test('two different challenges are independent', async () => {
    await clear();
    const a = attest.issueChallenge(10);
    const b = attest.issueChallenge(10);
    const solutionA = await solve(a);

    assert.equal((await attest.verifyAttestation(token(a, solutionA.counter))).ok, true);
    // b is untouched by a's use.
    const solutionB = await solve(b);
    assert.equal((await attest.verifyAttestation(token(b, solutionB.counter))).ok, true);
  });

  await test('a missing header is unproven, not failed', async () => {
    /*
     * The distinction the risk score depends on. `false` means "tried and failed" and is
     * scored as hostile; an old tab that sends nothing must not be.
     */
    const request = new Request('https://example.com');
    assert.equal(await attest.attestationSignal(request), undefined);
  });

  await test('a header that fails verification is a failure, not silence', async () => {
    await clear();
    const request = new Request('https://example.com', {
      headers: { 'x-tr-attestation': token({ nonce: 'x', difficulty: 0, expiresAt: Date.now() + 1000, signature: 'bad' }, 0) },
    });
    assert.equal(await attest.attestationSignal(request), false);
  });

  await test('spent nonces are purged once they cannot be replayed anyway', async () => {
    await clear();
    await db
      .collection('attestations')
      .doc('ancient')
      .set({ usedAt: new Date(Date.now() - 86_400_000).toISOString(), difficulty: 10 });

    assert.equal(await attest.purgeSpentAttestations(), 1);
    assert.equal((await db.collection('attestations').doc('ancient').get()).exists, false);
  });

  await clear();

  console.log(`\n${passed}/${passed + failures.length} passed\n`);
  if (failures.length > 0) process.exit(1);
}

void run();
