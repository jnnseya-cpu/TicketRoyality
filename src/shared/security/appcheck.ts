/**
 * Attestation — what proves a request came from a real client, and what it costs.
 *
 * ## The decision this file records
 *
 * Firebase App Check with reCAPTCHA Enterprise is the stronger mechanism, and it is not
 * what runs here. Two reasons, and the second is the real one:
 *
 * 1. It needs a site key created in the console and, above the free assessment tier, it
 *    bills per request. That is a running cost and a manual setup step on the critical
 *    path of launch.
 * 2. It was **not configured**, and had not been for the whole life of the codebase.
 *    Every surface below was therefore "monitor" in practice, which is a polite word for
 *    off. A defence that is one console visit away from existing has, in the meantime,
 *    the same effect as no defence at all — while making everyone believe it is covered.
 *
 * So the platform ships a free mechanism that is actually on: proof of work
 * (`shared/security/pow.ts`), issued and verified server-side, single-use, feeding the
 * existing risk score.
 *
 * ## What is honestly lost by that choice
 *
 * App Check enforces at **Firestore, Storage and Functions** — the Google service checks
 * the token, so a script that never touches our JavaScript still cannot read a document.
 * Proof of work enforces at **our routes**, because that is the only place we can check
 * it. A request that bypasses our API and talks to Firebase directly is bounded by
 * `firestore.rules` and by Firebase Auth's own limits, and by nothing else.
 *
 * That gap is real and is written down rather than glossed:
 *
 *   App Check       →  guards the data, costs money, needs a key
 *   Proof of work   →  guards our routes, costs CPU, needs nothing
 *
 * If the platform ever holds funds or a scraping problem appears at the data layer, App
 * Check is the upgrade and this file is where that conversation starts. Until then the
 * free mechanism is enforced everywhere it can be, which is more than was true before.
 */

export type AttestationProvider =
  | 'proof_of_work' // Web — this repository, no key, no vendor
  | 'recaptcha_enterprise' // Available if ever wanted; same GCP project
  | 'play_integrity' // Android, if a native app is ever built
  | 'app_attest'; // iOS, likewise

export interface AppCheckStatus {
  /** Whether a valid attestation accompanied the request. */
  attested: boolean;
  provider?: AttestationProvider;
}

/**
 * Proof of work needs no configuration, so attestation is always available.
 *
 * This used to report whether a reCAPTCHA site key existed, and it always answered no.
 */
export function isAttestationConfigured(): boolean {
  return true;
}

/**
 * How each surface treats a request that arrives with no attestation.
 *
 * `enforce` does **not** mean "refuse". Nothing here refuses on attestation alone, and
 * that is deliberate: the person whose browser cannot complete a proof of work is far
 * more likely to be on an old phone than to be an attacker. Enforcement means the signal
 * is weighted heavily in the risk score, and the rate limit budget is halved.
 *
 * The door is the one place this must never harden. A scanner in a venue basement that
 * cannot attest still has to admit ticket-holders.
 */
export type EnforcementMode = 'monitor' | 'enforce';

export const ENFORCEMENT: Record<string, EnforcementMode> = {
  'auth.signup': 'enforce',
  'auth.login': 'enforce',
  'checkout.create': 'enforce',
  'payment.verify': 'enforce',
  'organiser.register': 'enforce',
  'api.key.create': 'enforce',

  // Read paths stay light. Breaking the public catalogue to slow a scraper is a bad
  // trade: the catalogue is what the platform is for.
  'catalogue.read': 'monitor',
  'event.read': 'monitor',

  // Never hardened. See above.
  'door.scan': 'monitor',
};

export function enforcementFor(surface: string): EnforcementMode {
  return ENFORCEMENT[surface] ?? 'monitor';
}

/**
 * The full no-new-vendor defence set.
 *
 * Every layer is either Firebase, the same Google Cloud project, or code in this
 * repository. Nothing requires an additional supplier, contract or invoice — and, after
 * this change, nothing requires a console step that has not been taken either.
 */
export const DEFENCE_INVENTORY = [
  { layer: 'Proof-of-work attestation', provider: 'This repository — no key, no vendor, enforced today' },
  { layer: 'Email verification gate', provider: 'Firebase Auth' },
  { layer: 'MFA / step-up', provider: 'Firebase Auth' },
  { layer: 'Authorisation', provider: 'firestore.rules' },
  { layer: 'Honeypot field', provider: 'This repository' },
  { layer: 'Timing and interaction signals', provider: 'This repository' },
  { layer: 'Velocity and device-reuse scoring', provider: 'This repository + Firestore' },
  { layer: 'Rate limiting, namespaced', provider: 'This repository + Firestore counters' },
  { layer: 'Prompt-injection defence', provider: 'This repository' },
  { layer: 'sentinel.v1 anti-intrusion', provider: 'This repository + the AI gateway' },
  { layer: 'App Check at the data layer (upgrade path)', provider: 'Firebase — needs a key and a budget' },
  { layer: 'Edge WAF (optional, later)', provider: 'Google Cloud Armor — same project' },
] as const;
