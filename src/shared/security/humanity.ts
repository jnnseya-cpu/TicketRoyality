/**
 * Humanity gating.
 *
 * The goal is precise: make automated access cost more than it is worth, and make the
 * accounts that do get through useless before they can act. "Impossible" is not
 * achievable — a determined attacker can pay a human to solve any challenge for a
 * fraction of a penny — and chasing it produces a login that punishes real customers
 * while barely inconveniencing bots.
 *
 * So: score the request, apply friction proportionally, and gate every privileged
 * action on verified humanity rather than on a single check at the door.
 */

export type RiskBand = 'low' | 'medium' | 'high' | 'severe';

export interface RequestSignals {
  /**
   * Firebase App Check attestation (`shared/security/appcheck.ts`). Absent means
   * unproven, not hostile — a browser with an outdated cached token is not an attack.
   */
  attested?: boolean;
  /** Known datacentre / hosting ASN. */
  datacentreIp?: boolean;
  knownVpn?: boolean;
  /** Disposable or role address — info@, admin@, mailinator. */
  disposableEmail?: boolean;
  roleAddress?: boolean;
  /** Signups from this network in the last hour. */
  networkVelocity?: number;
  /** Accounts already sharing this device fingerprint. */
  deviceReuse?: number;
  /** Milliseconds from form render to submit. */
  fillMillis?: number;
  /** Did the form receive real focus/keyboard events? */
  humanInteraction?: boolean;
  /** Honeypot field was filled — only automation does this. */
  honeypotTripped?: boolean;
  newDevice?: boolean;
  impossibleTravel?: boolean;
}

export interface RiskAssessment {
  score: number; // 0 (certainly human) → 100 (certainly not)
  band: RiskBand;
  reasons: string[];
  action: 'allow' | 'challenge' | 'verify' | 'refuse';
}

/**
 * Deterministic, explainable scoring. Deliberately not a model: a login decision a
 * human cannot reconstruct is a login decision nobody can debug at 3am, and an
 * attacker probing it learns nothing from a rule they cannot see either way.
 */
export function assessRisk(signals: RequestSignals): RiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  /*
   * Honeypot is strong evidence, not proof.
   *
   * It was 70, which alone reached the `severe` band and refused outright. That is a
   * single point of failure in a decision that must not have one: browser autofill and
   * password managers fill hidden fields too, and when this one was named
   * `company_website_url` they did exactly that — refusing real people on one signal.
   *
   * 55 keeps it decisive in combination (with a sub-second fill, or no interaction at
   * all, it still refuses) while requiring corroboration before locking anyone out.
   * The asymmetry is deliberate: a wrong refusal is a customer who never comes back, a
   * wrong allow is one spam account an admin suspends in a click.
   */
  if (signals.honeypotTripped) add(55, 'honeypot field completed');

  // Sub-second completion of a multi-field form is not typing, it is pasting or
  // scripting. 800ms is generous — a fast human with autofill clears it.
  if (signals.fillMillis !== undefined && signals.fillMillis < 800) {
    add(35, 'form completed faster than a human can');
  }
  if (signals.humanInteraction === false) add(30, 'no focus or keyboard events');

  if (signals.datacentreIp) add(25, 'request from a hosting provider');
  if (signals.attested === false) add(30, 'App Check attestation failed');
  if (signals.disposableEmail) add(25, 'disposable email domain');
  if (signals.roleAddress) add(10, 'role address rather than a person');

  if ((signals.networkVelocity ?? 0) > 5) add(25, 'many signups from this network');
  if ((signals.deviceReuse ?? 0) > 3) add(30, 'device already linked to several accounts');

  if (signals.impossibleTravel) add(35, 'impossible travel since last session');
  if (signals.newDevice) add(5, 'unrecognised device');

  // A VPN is not evidence of anything. Privacy-conscious people are not attackers,
  // and scoring them as such is how a platform ends up blocking its best customers.
  if (signals.knownVpn) add(0, 'vpn detected — not scored');

  score = Math.min(100, score);

  const band: RiskBand =
    score >= 70 ? 'severe' : score >= 40 ? 'high' : score >= 15 ? 'medium' : 'low';

  const action =
    band === 'severe' ? 'refuse' : band === 'high' ? 'verify' : band === 'medium' ? 'challenge' : 'allow';

  return { score, band, reasons, action };
}

/**
 * What an unverified account may do — the half that actually holds.
 *
 * Blocking signup is a filter attackers route around. Making a smuggled account
 * worthless is not: it removes the reason to create one.
 */
export const UNVERIFIED_DENIED = [
  'purchase',
  'waitlist.join',
  'presale.claim',
  'referral.use',
  'organiser.register',
  'api.key.create',
  'follow.notify',
  'review.post',
] as const;

export type GatedAction = (typeof UNVERIFIED_DENIED)[number];

export function requiresVerifiedHuman(action: string): action is GatedAction {
  return (UNVERIFIED_DENIED as readonly string[]).includes(action);
}
