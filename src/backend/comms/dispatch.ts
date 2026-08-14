import 'server-only';

import { findEvent, render, resolveChannels } from '@/shared/comms';
import type { Channel, DeliveryRecord, DeliveryStatus } from '@/shared/comms/types';

/**
 * The single door every notification passes through.
 *
 * Nothing in the application sends an email, SMS or push directly. One door means one
 * place where consent is checked, one place where delivery is recorded, and one place
 * to look when a customer says a ticket never arrived — which, on a ticketing
 * platform, is the support question that matters most.
 */
export interface DispatchRequest {
  eventKey: string;
  recipient: { email?: string; phone?: string; pushToken?: string; userId?: string };
  vars?: Record<string, string | number>;
  /** Channel opt-outs. Ignored entirely when the event is mandatory. */
  preferences?: Partial<Record<Channel, boolean>>;
  /** Sandbox records the attempt without calling a provider. */
  sandbox?: boolean;
}

export interface DispatchResult {
  eventKey: string;
  subject: string;
  attempted: Channel[];
  suppressed: Channel[];
  records: DeliveryRecord[];
}

function providerFor(channel: Channel): string {
  switch (channel) {
    case 'email':
      // SMTP only. An email API would be a sixth vendor (CLAUDE.md §1).
      return 'smtp';
    case 'sms':
    case 'whatsapp':
      return 'twilio';
    case 'push':
      return 'fcm';
    case 'inapp':
      return 'firestore';
  }
}

function configured(channel: Channel): boolean {
  switch (channel) {
    case 'email':
      return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    case 'sms':
    case 'whatsapp':
      return Boolean(process.env.TWILIO_ACCOUNT_SID);
    case 'push':
      return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    case 'inapp':
      return true; // Always available — it is a Firestore write, not a vendor call.
  }
}

function addressFor(channel: Channel, recipient: DispatchRequest['recipient']) {
  switch (channel) {
    case 'email':
      return recipient.email;
    case 'sms':
    case 'whatsapp':
      return recipient.phone;
    case 'push':
      return recipient.pushToken;
    case 'inapp':
      return recipient.userId;
  }
}

let sequence = 0;
function nextId() {
  sequence += 1;
  return `dlv_${sequence.toString(36)}`;
}

/**
 * Resolves the event, applies consent, and records an outcome per channel.
 *
 * Never throws on a provider failure. A ticket confirmation that fails on SMS must
 * still go by email — treating the whole dispatch as atomic would mean one unreachable
 * channel suppresses every other one.
 */
export async function dispatch(request: DispatchRequest): Promise<DispatchResult> {
  const event = findEvent(request.eventKey);
  if (!event) {
    throw new Error(
      `Unknown communication event "${request.eventKey}". Every message must be declared in the catalogue.`
    );
  }

  const subject = render(event.subject, request.vars);
  const allowed = resolveChannels(event, request.preferences);
  const suppressed = event.channels.filter((c) => !allowed.includes(c));
  const records: DeliveryRecord[] = [];
  const at = new Date().toISOString();

  for (const channel of allowed) {
    const address = addressFor(channel, request.recipient);
    let status: DeliveryStatus;
    let error: string | undefined;

    if (!address) {
      status = 'suppressed';
      error = `No ${channel} address for recipient`;
    } else if (request.sandbox || !configured(channel)) {
      // Sandbox is not a failure. Recording the attempt means the flow is testable
      // before a single provider key exists, which is what keeps QA honest.
      status = 'logged';
    } else {
      status = 'queued';
    }

    records.push({
      id: nextId(),
      eventKey: event.key,
      channel,
      recipient: address ?? 'unknown',
      status,
      provider: providerFor(channel),
      at,
      error,
    });
  }

  return { eventKey: event.key, subject, attempted: allowed, suppressed, records };
}
