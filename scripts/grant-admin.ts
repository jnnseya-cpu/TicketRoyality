/**
 * Promotes an existing account to platform administrator.
 *
 * There is deliberately no way to sign up as an admin. Registration produces a
 * `customer` or an `organiser` and nothing else, and `firestore.rules` grants every
 * privileged read and write on `userDoc().userType == 'superuser'`. So the first
 * administrator has to be made from outside the application, by somebody holding
 * Google Cloud credentials for the project.
 *
 * The alternatives are all worse. "First account becomes admin" is a race anyone can
 * win by signing up quickly. A bootstrap endpoint is a permanent unauthenticated door
 * into the highest privilege on the platform. An email allowlist in config means a
 * repository edit escalates privilege.
 *
 * This runs on the operator's machine with Application Default Credentials, touches
 * one document, and leaves no surface behind.
 *
 *   # once, if not already authenticated for the project
 *   gcloud auth application-default login
 *
 *   npm run grant:admin -- you@example.com --project ticketroyality-prod
 *   npm run grant:admin -- you@example.com --project ticketroyality-prod --revoke
 *   npm run grant:admin -- you@example.com --project ticketroyality-prod --set-password
 *
 * `--set-password` exists because of a real constraint on this platform:
 * `admin@ticketroyality.com` is a login with **no inbox**. Firebase's password reset
 * emails it and they land nowhere, so the ordinary "forgot password" flow can never
 * recover that account. This is the recovery path for it.
 */
import { createInterface } from 'node:readline';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const revoke = args.includes('--revoke');
const setPassword = args.includes('--set-password');
const create = args.includes('--create');

function flag(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

const projectId =
  flag('project') ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!email) {
  die(
    'Usage: npm run grant:admin -- <email> --project <project-id> ' +
      '[--create] [--revoke] [--set-password]'
  );
}
if (!projectId) {
  die('No project. Pass --project <project-id> or set GOOGLE_CLOUD_PROJECT.');
}

/**
 * Reads a password without echoing it.
 *
 * Never taken from argv: a password on the command line is written to shell history
 * and is visible in the process list to every other user on the machine.
 */
function promptPassword(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  return new Promise((resolve) => {
    const stdout = process.stdout as NodeJS.WriteStream & { muted?: boolean };
    stdout.muted = false;

    // @ts-expect-error _writeToOutput is internal to readline but is the only hook
    // for suppressing echo without pulling in a dependency for one prompt.
    rl._writeToOutput = function (chunk: string) {
      if (stdout.muted) return;
      stdout.write(chunk);
    };

    rl.question(label, (answer) => {
      stdout.muted = false;
      stdout.write('\n');
      rl.close();
      resolve(answer);
    });

    stdout.muted = true;
  });
}

async function main() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId });
  }

  const auth = getAuth();
  const db = getFirestore();

  let user;
  try {
    user = await auth.getUserByEmail(email!);
  } catch {
    if (!create) {
      die(
        `No account exists for ${email} in ${projectId}.\n` +
          '  Pass --create to create it here, or sign up through the site first.'
      );
    }

    /*
     * Created here rather than through the sign-up form, deliberately.
     *
     * The public form runs the humanity gate, which is tuned for strangers and is
     * right to be: it scores role addresses, fast fills and honeypot hits. An
     * administrator being set up by the person who owns the project is none of those
     * things, and making the platform's most privileged account depend on passing a
     * bot filter means one false positive locks you out of your own system.
     *
     * Whoever can run this already holds project credentials. There is nothing left
     * for a bot check to protect.
     */
    const password = await promptPassword(`Password for the new ${email}: `);
    const confirm = await promptPassword('Confirm: ');
    if (password !== confirm) die('Passwords do not match. Nothing created.');
    if (password.length < 12) {
      die('Use at least 12 characters. This account holds every privilege on the platform.');
    }

    user = await auth.createUser({
      email: email!,
      password,
      emailVerified: true,
      displayName: 'Platform Administrator',
    });
    console.log(`\n✓ Created auth user ${user.uid}`);
  }

  const ref = db.collection('users').doc(user.uid);
  let snap = await ref.get();

  if (!snap.exists) {
    if (!create) {
      die(
        `Auth user ${user.uid} exists but has no users/ document.\n` +
          '  Finish registration in the app, or re-run with --create.'
      );
    }
    // The app reads this document, not the auth record, so an auth user without one
    // signs in successfully and then has no role, no name and no dashboard.
    await ref.set({
      uid: user.uid,
      email: email!,
      fullName: 'Platform Administrator',
      userType: 'customer',
      status: 'approved',
      createdAt: new Date().toISOString(),
    });
    snap = await ref.get();
    console.log(`✓ Created users/${user.uid}`);
  }

  if (setPassword) {
    const password = await promptPassword(`New password for ${email}: `);
    const confirm = await promptPassword('Confirm: ');

    if (password !== confirm) die('Passwords do not match. Nothing changed.');
    if (password.length < 12) {
      die('Use at least 12 characters. This account holds every privilege on the platform.');
    }

    await auth.updateUser(user.uid, { password });
    // Existing sessions keep working until their ID token expires unless they are
    // revoked, which is the wrong behaviour if the reason for the reset is a
    // compromise.
    await auth.revokeRefreshTokens(user.uid);

    console.log(`\n✓ Password updated for ${email}`);
    console.log('  All existing sessions revoked. Sign in again.\n');
    return;
  }

  const current = snap.data() as { userType?: string; fullName?: string };
  const next = revoke ? 'customer' : 'superuser';

  if (current.userType === next) {
    console.log(`\n  ${email} is already ${next}. Nothing to do.\n`);
    return;
  }

  // A targeted update, never a set(): overwriting the document would drop the wallet
  // balance, the address and everything else the account has accumulated.
  await ref.update({
    userType: next,
    // An audit trail on the document itself, so a privilege change is visible to
    // anyone reading the record rather than only in Cloud Logging.
    privilegeChangedAt: new Date().toISOString(),
    privilegeChangedBy: 'scripts/grant-admin.ts',
  });

  console.log(`\n✓ ${email} (${user.uid})`);
  console.log(`  ${current.userType ?? 'unknown'} → ${next}`);
  console.log(`  project: ${projectId}\n`);

  if (!revoke) {
    console.log('  Sign out and back in for the change to take effect.');
    console.log('  Admin console: /dashboard/superuser\n');
  }
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
