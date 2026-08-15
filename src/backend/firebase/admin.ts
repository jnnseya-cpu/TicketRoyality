import 'server-only';

import { getApps, initializeApp, applicationDefault, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * The Admin SDK, for the small number of operations a client may never perform.
 *
 * `firestore.rules` denies clients the writes that matter — a user cannot mint a ticket
 * for somebody else, and nobody at all can write `wallet_ledger`. Those rules are the
 * security model, so the privileged path deliberately goes around them here rather
 * than weakening them there.
 *
 * On App Hosting and Cloud Functions, credentials come from the runtime service
 * account via Application Default Credentials — there is no key to manage, rotate or
 * leak, which is the main reason not to use a service-account JSON file even though it
 * is the more commonly documented route. The explicit-credential branch exists only
 * for running outside Google Cloud.
 */

let app: App | undefined;

export function isAdminConfigured(): boolean {
  // On Google Cloud this is injected automatically; locally it is the emulator host or
  // an explicit service account. If none of these is present, the Admin SDK would
  // initialise and then fail on first use, which is a worse failure than declining.
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIREBASE_CONFIG ||
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function adminApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    // A pasted JSON blob, for environments outside Google Cloud. Parsed defensively:
    // a malformed value here fails at startup with a clear message rather than on the
    // first webhook with a stack trace from inside the SDK.
    let parsed: { project_id?: string; client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON.');
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.');
    }
    app = initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        // Escaped newlines survive most secret stores; real ones do not.
        privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      }),
    });
    return app;
  }

  app = initializeApp({ credential: applicationDefault() });
  return app;
}

/**
 * The initialised Admin app, for SDK surfaces other than Firestore.
 *
 * Exported so `firebase-admin/auth` can verify ID tokens against the same credentials
 * and the same single initialisation. Calling `initializeApp` a second time elsewhere
 * would throw on the duplicate app name, and passing no app would re-resolve
 * credentials independently of the branch logic above.
 */
export function getAdminApp(): App {
  return adminApp();
}

let firestore: Firestore | undefined;

export function getAdminDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    // Without this an `undefined` field throws mid-transaction rather than being
    // omitted, and the failure surfaces as a failed issuance rather than as a missing
    // optional field.
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
