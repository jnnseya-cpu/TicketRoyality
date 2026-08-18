/**
 * Rich Firestore permission error. Carries the exact path, operation and payload
 * that were rejected, so a rules violation is debuggable instead of just
 * "Missing or insufficient permissions".
 */
export class FirestorePermissionError extends Error {
  readonly path: string;
  readonly operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  readonly requestResourceData?: unknown;

  constructor(context: {
    path: string;
    operation: FirestorePermissionError['operation'];
    requestResourceData?: unknown;
  }) {
    super(
      `Firestore permission denied: ${context.operation.toUpperCase()} ${context.path}\n` +
        (context.requestResourceData
          ? `Payload: ${JSON.stringify(context.requestResourceData, null, 2)}`
          : '')
    );
    this.name = 'FirestorePermissionError';
    this.path = context.path;
    this.operation = context.operation;
    this.requestResourceData = context.requestResourceData;
  }
}

/** Turns a Firebase auth error code into a message a real person can act on. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is switched off for this project. Enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised for sign-in. Add it in Firebase Console → Authentication → Settings → Authorised domains.';
    case 'auth/admin-restricted-operation':
      return 'New sign-ups are restricted on this project. Turn off the "Allow only admins to create users" restriction in Firebase Console → Authentication → Settings.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/internal-error':
      return 'Firebase rejected the request without saying why. This is usually a project configuration problem rather than anything you typed.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. If you have not registered this account yet, sign up first.';
    case 'auth/email-already-in-use':
      /*
       * Only reached when the account is genuinely complete. A half-made one — an Auth
       * user whose profile write never landed — is finished by re-submitting the form
       * with the same credentials rather than refused, so this no longer sends anybody
       * into the loop where logging in shows an empty dashboard and registering again
       * says the email is taken.
       */
      return 'An account with this email already exists. Log in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error reaching Firebase. Check your connection and try again.';
    case 'auth/configuration-not-found':
    case 'auth/invalid-api-key':
      return 'Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* variables in .env.local.';
    case 'auth/requires-recent-login':
      return 'For security, please log out and log back in before performing this action.';
    default:
      /*
       * Never hide a code we have not seen before. The old default returned "Something
       * went wrong. Please try again." for everything, which is why an entire day went
       * into a failure that was naming itself the whole time: `auth/operation-not-allowed`
       * and a Firestore rules denial produced identical, useless text, and there was no
       * way to tell from the screen which one you were looking at.
       *
       * A code in brackets is mild noise for a customer and the whole answer for whoever
       * has to fix it.
       */
      return code
        ? `Something went wrong. Please try again. (${code})`
        : 'Something went wrong. Please try again.';
  }
}

/**
 * The one error formatter every form should use.
 *
 * ## Why this exists
 *
 * Registration and sign-in each touch three systems — the sign-up gate, Firebase Auth,
 * then Firestore — and only the middle one produces `auth/*` codes. Reading `.code` and
 * handing it to `authErrorMessage()` therefore worked for exactly one third of the
 * failures and silently generalised the rest into "Something went wrong".
 *
 * The information was never missing. `repositories.ts` goes to the trouble of
 * rethrowing a denial as a `FirestorePermissionError` carrying the exact path,
 * operation and payload; the form then dropped all of it because that error has no
 * `.code`. This reads whatever the error actually is.
 *
 * Callers should still `console.error(error)` alongside this — the returned string is
 * deliberately short enough for a toast, which means it is shorter than the truth.
 */
export function describeError(error: unknown): string {
  if (error instanceof FirestorePermissionError) {
    return (
      `The database refused to ${error.operation} ${error.path}. ` +
      'Your sign-in worked; the security rules did not allow the write. ' +
      'If you administer this site, deploy firestore.rules and check whether App Check ' +
      'enforcement is switched on for Cloud Firestore.'
    );
  }

  const code = (error as { code?: string })?.code;

  if (typeof code === 'string') {
    if (code.startsWith('auth/')) return authErrorMessage(code);

    if (code.startsWith('storage/')) {
      switch (code) {
        case 'storage/unauthorized':
          return 'The image was refused by Storage. Deploy storage.rules, or check the file size and type.';
        case 'storage/quota-exceeded':
          return 'The storage bucket is full.';
        case 'storage/retry-limit-exceeded':
          return 'The upload timed out. Check your connection and try a smaller image.';
        case 'storage/unauthenticated':
          return 'You were signed out during the upload. Sign in and try again.';
        default:
          return `The image could not be uploaded. (${code})`;
      }
    }

    // Firestore's own codes, which arrive when the call was not wrapped by a repository.
    switch (code) {
      case 'permission-denied':
        return 'The database refused this operation. The security rules do not allow it — deploy firestore.rules, and check whether App Check enforcement is on for Cloud Firestore.';
      case 'unauthenticated':
        return 'The database did not recognise your sign-in. This is what App Check enforcement looks like when the app holds no App Check token.';
      case 'unavailable':
        return 'The database could not be reached. Check your connection and try again.';
      case 'failed-precondition':
        return 'The database needs an index this query does not have yet. The full error in the browser console contains a link that creates it.';
      case 'resource-exhausted':
        return 'The project has hit a Firebase quota. Check billing and quotas in the Firebase console.';
      case 'deadline-exceeded':
        return 'The database took too long to answer. Try again.';
      default:
        return `Something went wrong. Please try again. (${code})`;
    }
  }

  // No code at all: a plain Error, usually one we threw ourselves — the login guard's
  // refusal, for instance. Its message is written for a person, so show it.
  const message = (error as { message?: string })?.message;
  return message && message.length < 200 ? message : 'Something went wrong. Please try again.';
}
