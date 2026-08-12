import 'server-only';

import { scanForInjection } from '@/backend/security/injection';

/**
 * `sentinel.v1` — the anti-intrusion agent.
 *
 * Watches authentication, checkout, door and agent telemetry for attack patterns, and
 * responds inside a bounded authority. Full contract in docs/03 §3.6.
 *
 * The authority boundary is the whole design. A defence agent that can lock accounts,
 * revoke keys and block addresses without limit is itself the most dangerous thing on
 * the platform: an attacker who triggers it can turn it into a denial-of-service
 * weapon aimed at your own customers, and a false positive at 03:00 locks out an
 * organiser on the morning of their on-sale.
 *
 * So it can *slow, challenge and isolate*. It cannot delete, refund, or lock a human
 * out permanently, and every containment it applies expires on its own.
 */

export type ThreatKind =
  | 'credential_stuffing'
  | 'account_takeover'
  | 'card_testing'
  | 'scalping'
  | 'ticket_forgery'
  | 'scraping'
  | 'prompt_injection'
  | 'privilege_probe'
  | 'payout_fraud'
  | 'enumeration';

export type Response =
  | 'observe'
  | 'challenge'
  | 'rate_limit'
  | 'step_up_mfa'
  | 'freeze_session'
  | 'escalate';

export interface Signal {
  kind: ThreatKind;
  confidence: number; // 0–1
  subject: string; // account, ip, device or key — never a bare person
  evidence: string[];
  at: string;
}

export interface Containment {
  response: Response;
  /** Every containment expires. Nothing sentinel does is permanent. */
  expiresInSeconds: number;
  reason: string;
  reversible: true;
  escalateToHuman: boolean;
}

/**
 * Detection rules, deterministic and explainable.
 *
 * Deliberately not a model. A security decision nobody can reconstruct is a security
 * decision nobody can appeal, and "the AI decided" is not an answer to give an
 * organiser locked out of their own event.
 */
export interface TelemetryWindow {
  failedLogins?: number;
  distinctAccountsAttempted?: number;
  failedPayments?: number;
  distinctCardsAttempted?: number;
  ticketsPurchased?: number;
  distinctIpsPerDevice?: number;
  catalogueRequests?: number;
  duplicateScans?: number;
  invalidSignatures?: number;
  outOfScopeAgentCalls?: number;
  payoutDestinationChanges?: number;
  signupEnumerationAttempts?: number;
  untrustedText?: string;
}

export function detect(subject: string, w: TelemetryWindow): Signal[] {
  const at = new Date().toISOString();
  const signals: Signal[] = [];
  const push = (kind: ThreatKind, confidence: number, evidence: string[]) =>
    signals.push({ kind, confidence, subject, evidence, at });

  // Many failures across many accounts is stuffing; many failures on one account is a
  // person who forgot their password. The distinction is the account count.
  if ((w.failedLogins ?? 0) >= 10 && (w.distinctAccountsAttempted ?? 0) >= 5) {
    push('credential_stuffing', 0.9, [
      `${w.failedLogins} failed logins across ${w.distinctAccountsAttempted} accounts`,
    ]);
  }

  if ((w.failedPayments ?? 0) >= 5 && (w.distinctCardsAttempted ?? 0) >= 4) {
    push('card_testing', 0.92, [
      `${w.failedPayments} declines across ${w.distinctCardsAttempted} cards`,
    ]);
  }

  if ((w.ticketsPurchased ?? 0) > 20 && (w.distinctIpsPerDevice ?? 0) > 5) {
    push('scalping', 0.75, ['high volume across rotating addresses on one device']);
  }

  if ((w.catalogueRequests ?? 0) > 2000) {
    push('scraping', 0.6, [`${w.catalogueRequests} catalogue requests in window`]);
  }

  if ((w.duplicateScans ?? 0) >= 3) {
    push('ticket_forgery', 0.8, [`${w.duplicateScans} duplicate scans presented`]);
  }

  if ((w.invalidSignatures ?? 0) >= 3) {
    push('privilege_probe', 0.85, ['repeated invalid webhook signatures']);
  }

  // An agent asking for a scope it does not hold is the strongest injection signal
  // available, because a successful injection must eventually request an effect.
  if ((w.outOfScopeAgentCalls ?? 0) >= 1) {
    push('prompt_injection', 0.95, ['agent requested a scope outside its contract']);
  }

  if ((w.payoutDestinationChanges ?? 0) >= 2) {
    push('payout_fraud', 0.85, ['payout destination changed more than once in window']);
  }

  if ((w.signupEnumerationAttempts ?? 0) >= 20) {
    push('enumeration', 0.7, ['high-volume account existence probing']);
  }

  if (w.untrustedText) {
    const scan = scanForInjection(w.untrustedText);
    if (scan.suspicious) {
      push('prompt_injection', Math.min(0.9, scan.score / 100), scan.matches);
    }
  }

  return signals;
}

/**
 * Maps a signal to a bounded response.
 *
 * Nothing here is permanent and nothing here touches money. The most severe action
 * available is freezing a *session* — not an account, not a payout, not a ticket.
 */
export function respond(signal: Signal): Containment {
  const high = signal.confidence >= 0.85;

  switch (signal.kind) {
    case 'credential_stuffing':
    case 'enumeration':
      return {
        response: high ? 'rate_limit' : 'challenge',
        expiresInSeconds: 900,
        reason: `${signal.kind}: ${signal.evidence.join('; ')}`,
        reversible: true,
        escalateToHuman: false,
      };

    case 'card_testing':
      return {
        response: 'rate_limit',
        expiresInSeconds: 3600,
        reason: `card testing: ${signal.evidence.join('; ')}`,
        reversible: true,
        // Money-adjacent, so a human sees it even though the response is bounded.
        escalateToHuman: true,
      };

    case 'account_takeover':
    case 'payout_fraud':
      return {
        response: 'step_up_mfa',
        expiresInSeconds: 0,
        reason: `${signal.kind}: ${signal.evidence.join('; ')}`,
        reversible: true,
        escalateToHuman: true,
      };

    case 'prompt_injection':
      return {
        // The run is stopped, not the user. The person who pasted the text may well be
        // an ordinary customer whose message quoted something hostile.
        response: 'freeze_session',
        expiresInSeconds: 0,
        reason: `injection attempt: ${signal.evidence.join('; ')}`,
        reversible: true,
        escalateToHuman: true,
      };

    case 'ticket_forgery':
    case 'privilege_probe':
      return {
        response: 'escalate',
        expiresInSeconds: 0,
        reason: `${signal.kind}: ${signal.evidence.join('; ')}`,
        reversible: true,
        escalateToHuman: true,
      };

    case 'scalping':
    case 'scraping':
      return {
        response: high ? 'rate_limit' : 'observe',
        expiresInSeconds: 1800,
        reason: `${signal.kind}: ${signal.evidence.join('; ')}`,
        reversible: true,
        escalateToHuman: false,
      };
  }
}

/**
 * What sentinel.v1 must never be given, at any autonomy level.
 *
 * These are not "not yet" items. Each one converts a defence into a weapon an attacker
 * can aim at the platform's own customers by deliberately triggering it.
 */
export const FORBIDDEN_CAPABILITIES = [
  'delete any record',
  'permanently ban an account',
  'reverse, hold or release a payment',
  'invalidate an issued ticket',
  'modify firestore.rules or IAM',
  'disable another agent',
  'suppress its own audit trail',
] as const;

/** Every containment is written to the audit log with the evidence attached. */
export interface SentinelAction {
  signal: Signal;
  containment: Containment;
  appliedAt: string;
  expiresAt?: string;
}

export function toAuditEntry(signal: Signal, containment: Containment): SentinelAction {
  const appliedAt = new Date().toISOString();
  return {
    signal,
    containment,
    appliedAt,
    expiresAt:
      containment.expiresInSeconds > 0
        ? new Date(Date.now() + containment.expiresInSeconds * 1000).toISOString()
        : undefined,
  };
}
