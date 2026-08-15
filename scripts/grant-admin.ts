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
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const revoke = args.includes('--revoke');

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
  die('Usage: npm run grant:admin -- <email> --project <project-id> [--revoke]');
}
if (!projectId) {
  die('No project. Pass --project <project-id> or set GOOGLE_CLOUD_PROJECT.');
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
    die(
      `No account exists for ${email} in ${projectId}.\n` +
        '  Sign up through the site first — this promotes an existing account, it does not create one.'
    );
  }

  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    die(
      `Auth user ${user.uid} exists but has no users/ document.\n` +
        '  Finish registration in the app before promoting the account.'
    );
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
