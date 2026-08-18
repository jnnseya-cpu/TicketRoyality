/**
 * `firestore.rules` tests, run against the real emulator. `npm run test:rules`
 *
 * These exist because of a specific finding: the users rule carried
 * `|| resource.data.userType == 'organiser'` on `get`, which made every approved
 * organiser's full user document — email, phone, postal address, date of birth —
 * readable by anyone who could reach Firestore. No account was needed, and organiser
 * uids are published in the sitemap, so the list of documents to fetch was public too.
 * `list` was `isSignedIn()`, which let one free registration enumerate every user on the
 * platform and read the same fields in bulk.
 *
 * A rules file is the only thing standing between a client SDK and the database. It is
 * the last place a change should be shipped on the strength of reading it carefully, so
 * from here it is executed instead.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';

const results: Array<[string, boolean]> = [];
let env: RulesTestEnvironment;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([name, false]);
    console.error(`  ✗ ${name}\n      ${(error as Error).message.split('\n')[0]}`);
  }
}

const ORGANISER = {
  uid: 'org-1',
  email: 'organiser@example.com',
  fullName: 'Royal Live',
  userType: 'organiser',
  status: 'approved',
  phone: '+44 7700 900000',
  dateOfBirth: '1985-04-02',
  address: { line1: '1 High St', city: 'London', postcode: 'E1 6AN', country: 'GB' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const CUSTOMER = {
  uid: 'cust-1',
  email: 'buyer@example.com',
  fullName: 'A Buyer',
  userType: 'customer',
  // 'pending', so that a test writing 'approved' is a real change. With the fixture
  // already approved the update was a no-op, `noPrivilegedFields()` saw an empty diff,
  // and the rule correctly allowed a write that changed nothing — the test was wrong,
  // not the rule.
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const ADMIN = {
  uid: 'admin-1',
  email: 'admin@example.com',
  fullName: 'Platform Admin',
  userType: 'superuser',
  status: 'approved',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'ticketroyality-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ORGANISER.uid), ORGANISER);
    await setDoc(doc(db, 'users', CUSTOMER.uid), CUSTOMER);
    await setDoc(doc(db, 'users', ADMIN.uid), ADMIN);
  });

  const anon = env.unauthenticatedContext().firestore();
  const customer = env.authenticatedContext(CUSTOMER.uid).firestore();
  const organiser = env.authenticatedContext(ORGANISER.uid).firestore();
  const admin = env.authenticatedContext(ADMIN.uid).firestore();

  console.log('\nfirestore.rules — users (the B4 leak)\n');

  await test('an anonymous visitor cannot read an organiser profile', async () => {
    await assertFails(getDoc(doc(anon, 'users', ORGANISER.uid)));
  });

  await test('a signed-in customer cannot read an organiser profile', async () => {
    // The regression that matters: one free registration used to be enough.
    await assertFails(getDoc(doc(customer, 'users', ORGANISER.uid)));
  });

  await test('a signed-in customer cannot list users', async () => {
    await assertFails(getDocs(collection(customer, 'users')));
  });

  await test('a customer cannot filter the user list to harvest organisers', async () => {
    // The exact query `getOrganisers()` runs. Denied for anyone but an administrator.
    await assertFails(
      getDocs(query(collection(customer, 'users'), where('userType', '==', 'organiser')))
    );
  });

  await test('an anonymous visitor cannot list users', async () => {
    await assertFails(getDocs(collection(anon, 'users')));
  });

  await test('a user can still read their own profile', async () => {
    await assertSucceeds(getDoc(doc(customer, 'users', CUSTOMER.uid)));
  });

  await test('an organiser can still read their own profile', async () => {
    await assertSucceeds(getDoc(doc(organiser, 'users', ORGANISER.uid)));
  });

  await test('an administrator can read any profile', async () => {
    await assertSucceeds(getDoc(doc(admin, 'users', ORGANISER.uid)));
  });

  await test('an administrator can list users', async () => {
    await assertSucceeds(getDocs(collection(admin, 'users')));
  });

  /*
   * Registration itself, which nothing here covered until it broke.
   *
   * Every test above starts from a user document written with the rules switched off,
   * so the suite could pass in full while the one write a real person actually makes —
   * creating their own profile, seconds after Firebase Auth accepted them — was refused
   * by the deployed rules. It was: the rules had never been published, the client saw a
   * bare permission-denied, and the form reported "Something went wrong."
   *
   * The payload below is the one `createUserProfile()` sends, wallet and welcome bonus
   * included, because a rule that allows a trimmed version of it proves nothing.
   */
  console.log('\nfirestore.rules — registration (the write that was refused)\n');

  const NEWCOMER = 'new-1';
  const newcomer = env.authenticatedContext(NEWCOMER).firestore();

  const signupPayload = (overrides: Record<string, unknown> = {}) => ({
    uid: NEWCOMER,
    email: 'newcomer@example.com',
    fullName: 'A Newcomer',
    userType: 'organiser',
    status: 'pending',
    phone: '+44 7700 900123',
    companyName: 'Newcomer Live',
    address: { line1: '2 High St', city: 'London', postcode: 'E1 6AN', country: 'United Kingdom' },
    createdAt: '2026-08-18T00:00:00.000Z',
    // Minted client-side by createUserProfile(). `noPrivilegedFields()` guards these on
    // update, not on create — a new account must be able to arrive holding its welcome
    // credit, or nobody can register at all.
    wallet: {
      balanceAcu: 100,
      lifetimeGrantedAcu: 100,
      lifetimePurchasedAcu: 0,
      lifetimeSpentAcu: 0,
      lastUpdatedAt: '2026-08-18T00:00:00.000Z',
    },
    welcomeBonusGranted: true,
    ...overrides,
  });

  await test('a new organiser can create their own pending profile', async () => {
    await assertSucceeds(setDoc(doc(newcomer, 'users', NEWCOMER), signupPayload()));
  });

  await test('a new customer can create their own approved profile', async () => {
    const uid = 'new-2';
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', uid),
        signupPayload({ uid, userType: 'customer', status: 'approved' })
      )
    );
  });

  await test('a new organiser cannot self-approve at creation', async () => {
    const uid = 'new-3';
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, 'users', uid), signupPayload({ uid, status: 'approved' })));
  });

  await test('a new user cannot mint themselves as superuser', async () => {
    const uid = 'new-4';
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(
      setDoc(doc(db, 'users', uid), signupPayload({ uid, userType: 'superuser' }))
    );
  });

  await test('a new user cannot create a profile at somebody else’s uid', async () => {
    const uid = 'new-5';
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, 'users', 'new-6'), signupPayload({ uid: 'new-6' })));
  });

  await test('a signed-out visitor cannot create a profile at all', async () => {
    await assertFails(setDoc(doc(anon, 'users', 'new-7'), signupPayload({ uid: 'new-7' })));
  });

  console.log('\nfirestore.rules — privilege escalation\n');

  await test('a user cannot promote themselves to superuser', async () => {
    await assertFails(updateDoc(doc(customer, 'users', CUSTOMER.uid), { userType: 'superuser' }));
  });

  await test('a user cannot approve their own organiser status', async () => {
    await assertFails(updateDoc(doc(customer, 'users', CUSTOMER.uid), { status: 'approved' }));
  });

  await test('a user cannot grant themselves a bespoke commission', async () => {
    await assertFails(updateDoc(doc(customer, 'users', CUSTOMER.uid), { commissionPercent: 0 }));
  });

  await test('a user cannot top up their own ACU wallet', async () => {
    await assertFails(
      updateDoc(doc(customer, 'users', CUSTOMER.uid), { wallet: { balanceAcu: 999999 } })
    );
  });

  await test('a user can still edit their own name and photo', async () => {
    await assertSucceeds(
      updateDoc(doc(customer, 'users', CUSTOMER.uid), {
        fullName: 'A Renamed Buyer',
        logoUrl: 'https://example.com/a.jpg',
      })
    );
  });

  await test('a user cannot edit somebody else', async () => {
    await assertFails(updateDoc(doc(customer, 'users', ORGANISER.uid), { fullName: 'Hijacked' }));
  });

  await test('a user cannot delete another account', async () => {
    await assertFails(updateDoc(doc(customer, 'users', ADMIN.uid), { userType: 'customer' }));
  });

  console.log('\nfirestore.rules — tickets\n');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tickets', 't-1'), {
      userId: CUSTOMER.uid,
      organizerId: ORGANISER.uid,
      eventId: 'e-1',
      status: 'valid',
      price: 25,
    });
  });

  await test('a stranger cannot read someone else’s ticket', async () => {
    const other = env.authenticatedContext('cust-2').firestore();
    await assertFails(getDoc(doc(other, 'tickets', 't-1')));
  });

  await test('the buyer can read their own ticket', async () => {
    await assertSucceeds(getDoc(doc(customer, 'tickets', 't-1')));
  });

  await test('a buyer cannot un-redeem a ticket', async () => {
    // The reuse attack: mark a redeemed ticket valid again and walk in twice.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tickets', 't-2'), {
        userId: CUSTOMER.uid,
        organizerId: ORGANISER.uid,
        eventId: 'e-1',
        status: 'redeemed',
        price: 25,
      });
    });
    await assertFails(updateDoc(doc(customer, 'tickets', 't-2'), { status: 'valid' }));
    await assertFails(updateDoc(doc(organiser, 'tickets', 't-2'), { status: 'valid' }));
  });

  await test('a buyer cannot change their own ticket price', async () => {
    await assertFails(updateDoc(doc(customer, 'tickets', 't-1'), { price: 0 }));
  });

  console.log('\nfirestore.rules — notifications\n');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'notifications', 'n-1'), {
      userId: CUSTOMER.uid,
      eventKey: 'order.refund.processed',
      title: 'Your refund was processed',
      body: 'Refunded to your card.',
      severity: 'success',
      createdAt: '2026-08-17T00:00:00.000Z',
    });
  });

  await test('a user reads their own notification', async () => {
    await assertSucceeds(getDoc(doc(customer, 'notifications', 'n-1')));
  });

  await test('a stranger cannot read someone else’s notification', async () => {
    // These carry the subject of what happened to a person — a refund, a suspension.
    // A readable-by-anyone list would be a feed of other people's account events.
    const other = env.authenticatedContext('cust-2').firestore();
    await assertFails(getDoc(doc(other, 'notifications', 'n-1')));
  });

  await test('a user cannot forge a notification to themselves', async () => {
    // A client that could create one could fabricate a message from the platform, and
    // screenshots of that travel.
    await assertFails(
      setDoc(doc(customer, 'notifications', 'forged'), {
        userId: CUSTOMER.uid,
        eventKey: 'account.locked',
        title: 'Your account has been locked',
        body: 'Click here',
        severity: 'critical',
        createdAt: '2026-08-17T00:00:00.000Z',
      })
    );
  });

  await test('a user may mark their own notification read', async () => {
    await assertSucceeds(
      updateDoc(doc(customer, 'notifications', 'n-1'), { readAt: '2026-08-17T01:00:00.000Z' })
    );
  });

  await test('a user cannot rewrite a notification’s contents', async () => {
    await assertFails(updateDoc(doc(customer, 'notifications', 'n-1'), { title: 'Something else' }));
  });

  console.log('\nfirestore.rules — hospitality bookings\n');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'hospitality_bookings', 'b-1'), {
      eventId: 'e-1',
      packageId: 'pkg-10',
      tierId: 'tier-vip',
      buyerUserId: CUSTOMER.uid,
      buyerEmail: 'customer@example.com',
      covers: 10,
      totalMinor: 150_000,
      depositMinor: 37_500,
      paidMinor: 37_500,
      status: 'deposit_paid',
      guests: [],
      createdAt: '2026-08-17T00:00:00.000Z',
    });
  });

  await test('a buyer reads their own table booking', async () => {
    await assertSucceeds(getDoc(doc(customer, 'hospitality_bookings', 'b-1')));
  });

  await test('a stranger cannot read someone else’s table booking', async () => {
    // A booking carries an email, a guest list and dietary needs. A readable-by-anyone
    // collection would be a guest list for every private table on the platform.
    const other = env.authenticatedContext('cust-2').firestore();
    await assertFails(getDoc(doc(other, 'hospitality_bookings', 'b-1')));
  });

  await test('a buyer cannot mark their own table paid', async () => {
    // The single most valuable write on the platform: £1,500 of table for one field.
    await assertFails(
      updateDoc(doc(customer, 'hospitality_bookings', 'b-1'), {
        paidMinor: 150_000,
        status: 'paid',
      })
    );
  });

  await test('a buyer cannot seat more people than they paid for', async () => {
    await assertFails(
      updateDoc(doc(customer, 'hospitality_bookings', 'b-1'), { covers: 20 })
    );
  });

  await test('a buyer cannot forge a booking', async () => {
    await assertFails(
      setDoc(doc(customer, 'hospitality_bookings', 'forged'), {
        eventId: 'e-1',
        buyerUserId: CUSTOMER.uid,
        covers: 10,
        totalMinor: 0,
        paidMinor: 0,
        status: 'paid',
      })
    );
  });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  await env.cleanup();
  if (failed.length > 0) process.exit(1);
}

void main();
