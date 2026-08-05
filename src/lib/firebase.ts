import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Firebase is configured entirely from environment variables — never hardcode keys.
 * Copy .env.example to .env.local and fill in your project's values.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

/**
 * When the project is unconfigured the app runs in demo mode against the seeded
 * dataset. `getAuth()` throws `auth/invalid-api-key` on an empty config — which would
 * crash prerendering — so the SDK is only initialised when real credentials exist,
 * and the exported handles are inert stand-ins otherwise. Nothing calls them in demo
 * mode: every data path checks `isFirebaseConfigured` first.
 */
function inert<T>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          `Firebase ${name} was used without configuration. Set NEXT_PUBLIC_FIREBASE_* in .env.local.`
        );
      },
    }
  ) as T;
}

let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  auth = inert<Auth>('Auth');
  db = inert<Firestore>('Firestore');
  storage = inert<FirebaseStorage>('Storage');
}

export { auth, db, storage };
