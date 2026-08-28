import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * Outbound webhooks.
 *
 * ## Signed, so the receiver can tell it was us
 *
 * A webhook that is only a POST to a URL is an invitation for anyone who learns that URL
 * to invent orders. Every delivery carries `TicketRoyality-Signature: t=…,v1=…`, an
 * HMAC over `timestamp.body` with the endpoint's own secret — the same construction
 * Stripe uses, chosen because integrators already have code for it and because signing the
 * timestamp alongside the body is what stops a captured delivery being replayed for ever.
 *
 * ## Retried, because the internet is not reliable
 *
 * A receiver being down for ten minutes must not lose an event. Failures are queued with
 * an increasing delay and retried by the cron; after the last attempt the delivery is
 * marked failed and stays visible in the log rather than disappearing. Silence is the one
 * outcome that would make this untrustworthy.
 *
 * ## Never blocks the thing that happened
 *
 * A ticket is issued whether or not a webhook is delivered. Deliveries are queued and sent
 * out of band; nothing in the sale path waits on somebody else's server.
 */

const ENDPOINTS = 'webhook_endpoints';
const DELIVERIES = 'webhook_deliveries';

/*
 * The catalogue is exactly what is emitted, and nothing else.
 *
 * `ticket.issued` is deliberately absent. Issuance runs in `functions/`, a separate
 * deployable that cannot import this module, so an event fired from here would be a
 * guess about something that had not happened yet — and a webhook that fires before the
 * tickets exist is worse than no webhook. `order.completed` is the honest one: the money
 * arrived, and the tickets follow.
 */
export type WebhookEvent =
  | 'order.completed'
  | 'ticket.redeemed'
  | 'ticket.refunded'
  | 'ticket.transferred'
  | 'ticket.upgraded'
  | 'seat.moved'
  | 'seat.upgraded'
  | 'donation.received';

/*
 * docs/25 §76, adopted selectively. `seat.held` and `seat.hold_expired` are deliberately
 * NOT events: a webhook per hold on a busy on-sale is a firehose that costs every
 * integrator money to receive and tells them nothing an inventory poll does not.
 * Events are things that changed an outcome — money, ownership, a seat.
 */
export const ALL_EVENTS: WebhookEvent[] = [
  'order.completed',
  'ticket.redeemed',
  'ticket.refunded',
  'ticket.transferred',
  'ticket.upgraded',
  'seat.moved',
  'seat.upgraded',
  'donation.received',
];

/** Increasing gaps, so a receiver that is down for a while is not hammered. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

export interface Endpoint {
  id: string;
  organizerId: string;
  url: string;
  events: WebhookEvent[];
  secretHint: string;
  createdAt: string;
  disabledAt?: string;
}

export function signPayload(secret: string, body: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Verify a signature — exported so the documentation can point at real code, and so our
 * own tests check the thing an integrator will actually run.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  now = Date.now(),
  toleranceSeconds = 300
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.trim().split('=') as [string, string])
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;

  // Outside the tolerance it is a replay, however good the signature is.
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(signPayload(secret, body, timestamp));
  const given = Buffer.from(parts.v1 ?? '');

  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function createEndpoint(input: {
  organizerId: string;
  url: string;
  events: WebhookEvent[];
}): Promise<{ ok: true; id: string; secret: string } | { ok: false; error: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'Unavailable right now.' };

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }

  /*
   * HTTPS only, and no private addresses. A webhook endpoint is a URL we will POST to on
   * a schedule, from inside our own network — pointed at `localhost` or `169.254.169.254`
   * it becomes a request forgery tool aimed at our own metadata service.
   */
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Webhook URLs must be https.' };

  // Strip the brackets URL keeps around IPv6 literals so the checks below see the address.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '169.254.169.254' ||
    /^(10\.|127\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.endsWith('.internal') ||
    // IPv6 loopback (::1) and link-local (fe80::/10, incl. the metadata address), plus
    // IPv4-mapped forms like ::ffff:169.254.169.254 / ::ffff:127.0.0.1 that slip past the
    // dotted-quad test above.
    host === '::1' ||
    host === '::' ||
    /^fe80:/.test(host) ||
    /^::ffff:(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    // A bare integer or hex host (e.g. https://2130706433 = 127.0.0.1) is never a real
    // public webhook target and is a classic denylist bypass — refuse it outright.
    /^(0x[0-9a-f]+|\d+)$/.test(host);

  if (blocked) return { ok: false, error: 'That address is not reachable from the internet.' };

  const secret = `whsec_${randomBytes(24).toString('base64url')}`;

  try {
    const ref = await getAdminDb()
      .collection(ENDPOINTS)
      .add({
        organizerId: input.organizerId,
        url: parsed.toString(),
        events: input.events.filter((e) => ALL_EVENTS.includes(e)),
        // Stored in full: unlike an API key, we must be able to sign with it on every
        // delivery. It is shown to the owner once and never again through the dashboard.
        secret,
        secretHint: `${secret.slice(0, 12)}…`,
        createdAt: new Date().toISOString(),
      });

    return { ok: true, id: ref.id, secret };
  } catch (error) {
    reportError(error, { scope: 'webhooks.create', organizerId: input.organizerId });
    return { ok: false, error: 'Could not create that endpoint.' };
  }
}

export async function listEndpoints(organizerId: string): Promise<Endpoint[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb()
      .collection(ENDPOINTS)
      .where('organizerId', '==', organizerId)
      .get();

    return snap.docs.map((d) => {
      const { secret: _secret, id: _id, ...rest } = d.data() as Endpoint & { secret: string };
      return { ...rest, id: d.id } as Endpoint;
    });
  } catch (error) {
    reportError(error, { scope: 'webhooks.list', organizerId });
    return [];
  }
}

export async function deleteEndpoint(id: string, organizerId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const ref = getAdminDb().collection(ENDPOINTS).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.organizerId !== organizerId) return false;
    await ref.delete();
    return true;
  } catch (error) {
    reportError(error, { scope: 'webhooks.delete', id });
    return false;
  }
}

/**
 * Queue an event for every endpoint that asked for it.
 *
 * Queued rather than sent: this is called from inside the paths that issue tickets and
 * take money, and none of them may wait on somebody else's server. The cron does the
 * sending.
 */
export async function queueEvent(
  organizerId: string,
  type: WebhookEvent,
  data: Record<string, unknown>
): Promise<number> {
  if (!isAdminConfigured()) return 0;

  try {
    const snap = await getAdminDb()
      .collection(ENDPOINTS)
      .where('organizerId', '==', organizerId)
      .where('events', 'array-contains', type)
      .get();

    const db = getAdminDb();
    const now = new Date().toISOString();
    let queued = 0;

    await Promise.all(
      snap.docs
        .filter((doc) => !doc.data().disabledAt)
        .map(async (doc) => {
          await db.collection(DELIVERIES).add({
            endpointId: doc.id,
            organizerId,
            type,
            payload: data,
            attempts: 0,
            status: 'pending',
            nextAttemptAt: now,
            createdAt: now,
          });
          queued += 1;
        })
    );

    return queued;
  } catch (error) {
    // A webhook that cannot be queued must never fail the sale that triggered it.
    reportError(error, { scope: 'webhooks.queue', organizerId, type });
    return 0;
  }
}

/**
 * Send what is due.
 *
 * Run from the cron. Each delivery gets its own try/catch: one endpoint timing out must
 * not stop the queue, which is exactly what happens if a single failure escapes the loop.
 */
export async function deliverDue(limit = 50): Promise<{ sent: number; failed: number }> {
  if (!isAdminConfigured()) return { sent: 0, failed: 0 };

  const db = getAdminDb();
  let sent = 0;
  let failed = 0;

  try {
    const due = await db
      .collection(DELIVERIES)
      .where('status', '==', 'pending')
      .where('nextAttemptAt', '<=', new Date().toISOString())
      .limit(limit)
      .get();

    for (const doc of due.docs) {
      const delivery = doc.data();

      try {
        const endpoint = await db.collection(ENDPOINTS).doc(delivery.endpointId).get();
        if (!endpoint.exists) {
          // The endpoint was removed while this was queued. Nothing to deliver to, and
          // nothing to retry — recorded rather than left pending for ever.
          await doc.ref.update({ status: 'orphaned', finishedAt: new Date().toISOString() });
          continue;
        }

        const secret = String(endpoint.data()?.secret ?? '');
        const body = JSON.stringify({
          id: doc.id,
          type: delivery.type,
          created: delivery.createdAt,
          data: delivery.payload,
        });
        const timestamp = Math.floor(Date.now() / 1000);

        const response = await fetch(String(endpoint.data()?.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TicketRoyality-Signature': `t=${timestamp},v1=${signPayload(secret, body, timestamp)}`,
            'TicketRoyality-Event': String(delivery.type),
          },
          body,
          // A receiver that hangs must not hold a cron slot open indefinitely.
          signal: AbortSignal.timeout(10_000),
          // Never follow a redirect. The URL was denylist-checked at registration, but a
          // public https endpoint can still 302 to `localhost`/metadata AFTER the fact —
          // following it would turn every delivery into a request-forgery hop. `manual`
          // makes fetch return an opaque non-ok response, so a redirecting endpoint is
          // treated as a failed delivery and retried, never chased inward.
          redirect: 'manual',
        });

        const attempts = (delivery.attempts ?? 0) + 1;

        if (response.ok) {
          await doc.ref.update({
            status: 'delivered',
            attempts,
            responseStatus: response.status,
            finishedAt: new Date().toISOString(),
          });
          sent += 1;
          continue;
        }

        const delay = RETRY_DELAYS_MS[attempts - 1];
        await doc.ref.update({
          attempts,
          responseStatus: response.status,
          // Out of retries: marked failed and kept in the log. Silence is the one
          // outcome that would make this untrustworthy.
          status: delay === undefined ? 'failed' : 'pending',
          ...(delay === undefined
            ? { finishedAt: new Date().toISOString() }
            : { nextAttemptAt: new Date(Date.now() + delay).toISOString() }),
        });
        failed += 1;
      } catch (error) {
        const attempts = (delivery.attempts ?? 0) + 1;
        const delay = RETRY_DELAYS_MS[attempts - 1];

        await doc.ref
          .update({
            attempts,
            lastError: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
            status: delay === undefined ? 'failed' : 'pending',
            ...(delay === undefined
              ? { finishedAt: new Date().toISOString() }
              : { nextAttemptAt: new Date(Date.now() + delay).toISOString() }),
          })
          .catch(() => undefined);

        failed += 1;
      }
    }
  } catch (error) {
    reportError(error, { scope: 'webhooks.deliver' });
  }

  return { sent, failed };
}

/** The delivery log, so an integrator can see what we sent and what came back. */
export async function recentDeliveries(organizerId: string, limit = 50) {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb()
      .collection(DELIVERIES)
      .where('organizerId', '==', organizerId)
      .limit(500)
      .get();

    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          status: data.status,
          attempts: data.attempts ?? 0,
          responseStatus: data.responseStatus ?? null,
          lastError: data.lastError ?? null,
          createdAt: data.createdAt,
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  } catch (error) {
    reportError(error, { scope: 'webhooks.log', organizerId });
    return [];
  }
}
