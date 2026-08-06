/**
 * Communication event architecture.
 *
 * One catalogue. Every notification the platform can send is declared here once, with
 * its channels, severity and opt-out status. Nothing sends an ad-hoc message — if it
 * is not in the catalogue it does not go out, which is what makes the consent position
 * in docs/04 M10 auditable rather than aspirational.
 */

export type Channel = 'email' | 'inapp' | 'sms' | 'push' | 'whatsapp';

export type Severity = 'info' | 'success' | 'warning' | 'critical';

export type Audience =
  | 'customer'
  | 'organiser'
  | 'gate_staff'
  | 'admin'
  | 'creator'
  | 'merchant'
  | 'venue'
  | 'host';

export interface CommsEvent {
  /** Namespaced and stable. Never renamed — downstream systems key on it. */
  key: string;
  label: string;
  /** Supports {{token}} interpolation. */
  subject: string;
  severity: Severity;
  channels: Channel[];
  audience: Audience[];
  /**
   * Bypasses marketing opt-outs.
   *
   * True only where the message is contractual (you bought a thing), legal (we must
   * tell you), or safety-critical (the venue changed). A marketing message marked
   * mandatory is the fastest way to lose the right to send either kind — docs/04 M10.
   */
  mandatory?: boolean;
  /** Why this exists, for whoever reviews the catalogue later. */
  note?: string;
}

export interface CommsCategory {
  id: string;
  label: string;
  description: string;
  events: CommsEvent[];
}

export type DeliveryStatus = 'sent' | 'logged' | 'queued' | 'failed' | 'suppressed';

export interface DeliveryRecord {
  id: string;
  eventKey: string;
  channel: Channel;
  recipient: string;
  status: DeliveryStatus;
  provider: string;
  at: string;
  error?: string;
}
