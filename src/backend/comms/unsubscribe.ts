import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * One-click unsubscribe tokens.
 *
 * An unsubscribe link that requires signing in is not an unsubscribe link. The person
 * clicking it has already decided; making them remember a password to act on that
 * decision is how you convert an opt-out into a spam complaint, and spam complaints are
 * what cost you the ability to deliver tickets.
 *
 * So the link carries proof instead of a session: an HMAC over the uid, signed with a
 * server secret. That is enough to be sure the request came from a link we generated —
 * which is all that is needed, because the only thing the token authorises is turning
 * marketing *off* for one account. It cannot turn marketing back on, read anything, or
 * touch any other field. The blast radius of a leaked token is one fewer newsletter.
 *
 * Keyed on `CRON_SECRET` rather than a key of its own. Rotating it invalidates
 * outstanding unsubscribe links, which is a real cost — but a second secret nobody
 * remembers to set is worse, and this one is already required for the scheduled jobs
 * that send the newsletter in the first place.
 */

function secret(): string | null {
  return process.env.CRON_SECRET ?? null;
}

export function signUnsubscribe(uid: string): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac('sha256', key).update(`unsubscribe:${uid}`).digest('hex');
}

export function verifyUnsubscribe(uid: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = signUnsubscribe(uid);
  if (!expected) return false;

  const received = token.trim();
  // Length check first: timingSafeEqual throws on a length mismatch rather than
  // returning false, and a thrown error here would be a 500 instead of a refusal.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/** The link that goes in the email footer. Absolute — it is read outside the app. */
export function unsubscribeUrl(uid: string, siteUrl: string): string | null {
  const token = signUnsubscribe(uid);
  if (!token) return null;
  return `${siteUrl}/unsubscribe?u=${encodeURIComponent(uid)}&t=${token}`;
}

/**
 * RFC 8058 headers.
 *
 * Gmail and Yahoo have required one-click unsubscribe from bulk senders since February
 * 2024. Without these headers a weekly send to a list is not "less effective" — it is
 * rejected or filed as spam wholesale, and the reputation damage lands on the same
 * domain and mailbox that deliver every ticket. That is the reason this is here rather
 * than on a backlog.
 *
 * `List-Unsubscribe-Post` is what makes it one *click*: the mail client POSTs the URL
 * itself, and the recipient never leaves their inbox.
 */
export function unsubscribeHeaders(
  uid: string,
  siteUrl: string
): Record<string, string> | undefined {
  const token = signUnsubscribe(uid);
  if (!token) return undefined;

  const url = `${siteUrl}/api/unsubscribe?u=${encodeURIComponent(uid)}&t=${token}`;
  return {
    'List-Unsubscribe': `<${url}>, <mailto:info@ticketroyality.com?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
