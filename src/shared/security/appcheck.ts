/**
 * Firebase App Check — attestation without a new vendor.
 *
 * App Check proves a request came from *our* app on a genuine device, not from a
 * script. It is Firebase-native and its provider is reCAPTCHA Enterprise, which lives
 * in the same Google Cloud project as everything else — so this adds a capability, not
 * a supplier.
 *
 * Why it beats a form-level CAPTCHA: App Check enforces at **Firestore, Storage and
 * Functions**, not at the page. A script that bypasses the sign-up form still cannot
 * read a document, because the attestation token is checked by the backend service
 * rather than by our own JavaScript.
 *
 *   form CAPTCHA  →  guards one door
 *   App Check     →  guards the data
 */

export type AttestationProvider =
  | 'recaptcha_enterprise' // Web — same GCP project
  | 'play_integrity' // Android
  | 'app_attest' // iOS
  | 'debug'; // Local development only

export interface AppCheckStatus {
  /** Whether a valid token accompanied the request. */
  attested: boolean;
  provider?: AttestationProvider;
  /** Set when attestation was skipped because App Check is not configured yet. */
  unconfigured?: boolean;
}

export function isAppCheckConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
}

/**
 * How each surface is treated when attestation is missing.
 *
 * Enforcement is staged deliberately. Turning App Check on in blocking mode across
 * everything on day one locks out any client we have not instrumented — including our
 * own gate scanner, mid-event. Monitor first, enforce where the risk is highest.
 */
export type EnforcementMode = 'monitor' | 'enforce';

export const ENFORCEMENT: Record<string, EnforcementMode> = {
  // Money and identity — enforce from the start. A request here that cannot prove it
  // came from our app has no legitimate reason to exist.
  'auth.signup': 'enforce',
  'auth.login': 'enforce',
  'checkout.create': 'enforce',
  'payment.verify': 'enforce',
  'organiser.register': 'enforce',
  'api.key.create': 'enforce',

  // Read paths — monitor first. Breaking the public catalogue to stop a scraper is a
  // bad trade: the catalogue is what the platform is for.
  'catalogue.read': 'monitor',
  'event.read': 'monitor',

  // The door. Never enforce without a rehearsed fallback: a scanner that cannot attest
  // in a venue basement must still admit ticket-holders (docs/04 M16).
  'door.scan': 'monitor',
};

export function enforcementFor(surface: string): EnforcementMode {
  return ENFORCEMENT[surface] ?? 'monitor';
}

/**
 * The full no-new-vendor defence set.
 *
 * Every layer below is either Firebase, the same Google Cloud project, or code in this
 * repository. Nothing here requires an additional supplier, contract or invoice.
 */
export const DEFENCE_INVENTORY = [
  { layer: 'App Check attestation', provider: 'Firebase + reCAPTCHA Enterprise (same GCP project)' },
  { layer: 'Email verification gate', provider: 'Firebase Auth' },
  { layer: 'MFA / step-up', provider: 'Firebase Auth' },
  { layer: 'Authorisation', provider: 'firestore.rules' },
  { layer: 'Honeypot field', provider: 'This repository' },
  { layer: 'Timing and interaction signals', provider: 'This repository' },
  { layer: 'Velocity and device-reuse scoring', provider: 'This repository + Firestore' },
  { layer: 'Rate limiting', provider: 'This repository + Firestore counters' },
  { layer: 'Prompt-injection defence', provider: 'This repository' },
  { layer: 'sentinel.v1 anti-intrusion', provider: 'This repository + the AI gateway' },
  { layer: 'Edge WAF (optional, later)', provider: 'Google Cloud Armor — same project' },
] as const;
