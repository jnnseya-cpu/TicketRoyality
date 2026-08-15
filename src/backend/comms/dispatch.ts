import 'server-only';

import { findEvent, render, resolveChannels } from '@/shared/comms';
import type { Channel, DeliveryRecord, DeliveryStatus } from '@/shared/comms/types';
import { siteUrl } from '@/shared/site';

import { isEmailConfigured, send } from './email';
import { recordDeliveries, type StoredDelivery } from './log';
import { catalogueEmail } from './template';

/**
 * The single door every notification passes through.
 *
 * Nothing in the application sends an email, SMS or push directly. One door means one
 * place where consent is checked, one place where delivery is recorded, and one place
 * to look when a customer says a ticket never arrived — which, on a ticketing platform,
 * is the support question that matters most.
 *
 * This used to stop short of actually sending: it resolved channels, built a record
 * marked `queued`, and called no provider. Every catalogue event except the ticket
 * itself was therefore a message the platform believed it had sent and had not. Email
 * now goes out over the same SMTP mailbox the ticket uses.
 *
 * The other channels still do not send, and the reason is a constraint rather than a
 * gap: SMS and WhatsApp have no approved provider inside the vendor list (CLAUDE.md
 * §1). They are recorded as `suppressed` with the reason attached, so the log tells the
 * truth about what left the building.
 */
export interface DispatchRequest {
  eventKey: string;
  recipient: { email?: string; phone?: string; pushToken?: string; userId?: string };
  vars?: Record<string, string | number>;
  /** Body paragraphs. Falls back to the subject when a caller supplies none. */
  body?: string[];
  action?: { label: string; url: string };
  /** Channel opt-outs. Ignored entirely when the event is mandatory. */
  preferences?: Partial<Record<Channel, boolean>>;
  /** Rehearsal: resolve and record everything, call no provider. */
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
      return 'none';
    case 'push':
      return 'fcm';
    case 'inapp':
      return 'firestore';
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

/**
 * Resolves the event, applies consent, delivers what it can, and records every outcome.
 *
 * Never throws on a provider failure. A ticket confirmation that fails on one channel
 * must still go by the others — treating the dispatch as atomic would let a single
 * unreachable channel suppress every one that works.
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
  const stored: StoredDelivery[] = [];
  const at = new Date().toISOString();

  for (const channel of allowed) {
    const address = addressFor(channel, request.recipient);
    let status: DeliveryStatus = 'suppressed';
    let error: string | undefined;
    let messageId: string | undefined;

    if (!address) {
      error = `No ${channel} address for recipient`;
    } else if (request.sandbox) {
      // A rehearsal is not a failure. Recording it means a template can be proven
      // before a single provider key exists.
      status = 'logged';
    } else if (channel === 'email') {
      if (!isEmailConfigured()) {
        status = 'suppressed';
        error = 'SMTP is not configured';
      } else {
        const rendered = catalogueEmail({
          event,
          subject,
          body: request.body?.length ? request.body.map((line) => render(line, request.vars)) : [subject],
          action: request.action,
          siteUrl: siteUrl(),
        });
        const outcome = await send({ to: address, ...rendered });
        status = outcome.status === 'sent' ? 'sent' : outcome.status === 'failed' ? 'failed' : 'suppressed';
        if (outcome.status === 'sent') messageId = outcome.messageId;
        else error = outcome.reason;
      }
    } else if (channel === 'sms' || channel === 'whatsapp') {
      // Declared in the catalogue as specification, undeliverable in practice. Recorded
      // as suppressed with the reason rather than `queued`, because `queued` claims
      // something is going to happen and nothing is.
      status = 'suppressed';
      error = 'No approved provider for this channel (CLAUDE.md §1)';
    } else {
      // push (FCM) and inapp (Firestore) are not wired yet. Honest state, not a lie
      // about a queue that does not exist.
      status = 'suppressed';
      error = `${channel} delivery is not implemented`;
    }

    const record: DeliveryRecord = {
      id: '',
      eventKey: event.key,
      channel,
      recipient: address ?? 'unknown',
      status,
      provider: providerFor(channel),
      at,
      error,
    };
    records.push(record);
    stored.push({
      ...record,
      severity: event.severity,
      sandbox: Boolean(request.sandbox),
      ...(messageId ? { messageId } : {}),
    });
  }

  // Awaited rather than fired and forgotten: on Cloud Run the instance can be frozen
  // the moment the response is returned, and a floating promise is a log entry that
  // sometimes exists.
  await recordDeliveries(stored);

  return { eventKey: event.key, subject, attempted: allowed, suppressed, records };
}
