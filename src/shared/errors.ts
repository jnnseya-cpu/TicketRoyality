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
      return 'Something went wrong. Please try again.';
  }
}
