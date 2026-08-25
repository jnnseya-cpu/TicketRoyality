import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { Attribution, PartnerKind, PartnerLink } from '@/shared/types';

/**
 * Tracked links, and the money they earn.
 *
 * ## One model, four intentions
 *
 * Affiliate, influencer, promoter, sponsor and customer referral are the same object.
 * Building five would mean five click counters and five commission calculations, and the
 * first time they disagreed nobody would know which was right. What genuinely differs is
 * the label, whether there is an allocation, and whether commission is owed at all — a
 * sponsor usually earns nothing and is measured, which is just `commissionPercent: 0`.
 *
 * ## Commission comes out of the organiser, and is recorded rather than paid
 *
 * The platform's own commission is zero, so there is nothing else for a partner's cut to
 * come from: it reduces what the organiser receives. Saying otherwise would misstate the
 * "you keep 100%" promise, so the organiser's dashboard shows it as money owed on top of
 * their payout rather than a platform deduction.
 *
 * **Nothing here moves money.** It records what is owed, with an audit row per order.
 * Paying a partner is a bank transfer the organiser makes, and inventing a second payout
 * path — with its own idempotency, its own failure modes and its own reconciliation —
 * for a number that can be read off a report is not a trade worth making yet. Said in
 * the UI, in `STATUS.md`, and here.
 *
 * ## Attribution is decided server-side, from the stored link
 *
 * The browser carries a code in a cookie and nothing else. The percentage, the scope and
 * whether the allocation is used up are all read from the link at the moment the payment
 * lands. A commission a browser could name is a commission a browser could set to 50%.
 */

const LINKS = 'partner_links';
const ATTRIBUTIONS = 'attributions';

/** The cookie the redirect sets and checkout reads. First-party, no third-party anything. */
export const REF_COOKIE = 'tr_ref';
/** Long enough to cover thinking about it over a weekend, short enough to mean something. */
export const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * A partner's read key for their own stats page.
 *
 * Derived rather than stored: there is nothing to leak from the database and nothing to
 * rotate. It proves the holder was given the link by the organiser, which is all the
 * authority a read-only performance page needs — partners overwhelmingly have no account
 * here, and requiring one to see their own numbers is how a referral programme dies.
 */
export function statsKey(code: string): string {
  const secret = process.env.CRON_SECRET ?? 'ticketroyality-partner-stats';
  return createHmac('sha256', secret).update(`stats:${normaliseCode(code)}`).digest('base64url').slice(0, 24);
}

export function statsKeyMatches(code: string, given: string): boolean {
  const expected = Buffer.from(statsKey(code));
  const supplied = Buffer.from(given ?? '');
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}

export type CreateResult =
  | { ok: true; link: PartnerLink; statsUrl: string }
  | { ok: false; status: 400 | 409 | 503; error: string };

export async function createLink(input: {
  code: string;
  kind: PartnerKind;
  partnerName: string;
  partnerEmail: string;
  organizerId: string;
  eventId?: string;
  commissionPercent: number;
  allocation?: number;
}): Promise<CreateResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Partner links are unavailable.' };

  const code = normaliseCode(input.code);
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    return { ok: false, status: 400, error: 'Use 3–24 letters, numbers or hyphens.' };
  }
  if (!input.partnerName.trim() || !input.partnerEmail.includes('@')) {
    return { ok: false, status: 400, error: 'A partner needs a name and an email address.' };
  }

  /*
   * Capped at 50%. Not a moral position — a link that owes more than half of face value
   * is almost always a typo, and the first anyone would know is a payout report that
   * says the organiser owes more than they took.
   */
  const commissionPercent = Math.min(50, Math.max(0, Number(input.commissionPercent) || 0));

  const link: PartnerLink = {
    code,
    kind: input.kind,
    partnerName: input.partnerName.trim().slice(0, 120),
    partnerEmail: input.partnerEmail.trim().toLowerCase(),
    organizerId: input.organizerId,
    ...(input.eventId ? { eventId: input.eventId } : {}),
    commissionPercent,
    ...(input.allocation && input.allocation > 0 ? { allocation: Math.floor(input.allocation) } : {}),
    active: true,
    createdAt: new Date().toISOString(),
    clicks: 0,
    sales: 0,
    ticketsSold: 0,
    grossMinor: 0,
    commissionMinor: 0,
  };

  try {
    // `create` so two organisers cannot claim one code — the codes are a global namespace
    // because they appear in a URL that has to resolve without knowing whose it is.
    await getAdminDb().collection(LINKS).doc(code).create(link);
    return { ok: true, link, statsUrl: `/partners/${code}?k=${statsKey(code)}` };
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      return { ok: false, status: 409, error: 'That code is already taken.' };
    }
    reportError(error, { scope: 'partners.create', code });
    return { ok: false, status: 503, error: 'Could not create that link.' };
  }
}

export async function getLink(code: string): Promise<PartnerLink | null> {
  if (!isAdminConfigured()) return null;
  try {
    const snap = await getAdminDb().collection(LINKS).doc(normaliseCode(code)).get();
    return snap.exists ? (snap.data() as PartnerLink) : null;
  } catch (error) {
    reportError(error, { scope: 'partners.get', code });
    return null;
  }
}

export async function listLinks(organizerId: string): Promise<PartnerLink[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(LINKS)
      .where('organizerId', '==', organizerId)
      .limit(500)
      .get();
    return snap.docs
      .map((d) => d.data() as PartnerLink)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'partners.list', organizerId });
    return [];
  }
}

export async function setActive(code: string, organizerId: string, active: boolean): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    const ref = getAdminDb().collection(LINKS).doc(normaliseCode(code));
    const snap = await ref.get();
    // Ownership from the document, never the request.
    if (!snap.exists || (snap.data() as PartnerLink).organizerId !== organizerId) return false;
    await ref.update({ active });
    return true;
  } catch (error) {
    reportError(error, { scope: 'partners.setActive', code });
    return false;
  }
}

/**
 * A click.
 *
 * Deliberately crude: one increment, no fingerprinting, no attempt to tell a person from
 * a preview bot. It measures traffic sent, and it is labelled as that rather than as
 * "unique visitors", because a number dressed up as more than it is gets used for more
 * than it can carry — like paying a partner per click.
 */
export async function recordClick(code: string): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await getAdminDb()
      .collection(LINKS)
      .doc(normaliseCode(code))
      .update({ clicks: FieldValue.increment(1) });
  } catch {
    // A click that cannot be counted must never break the redirect the customer clicked.
  }
}

export type AttributionResult =
  | { ok: true; commissionMinor: number }
  | { ok: false; reason: 'no-link' | 'inactive' | 'wrong-event' | 'allocation-spent' | 'duplicate' | 'self-referral' | 'unavailable' };

/**
 * Record an attributed sale, once.
 *
 * Idempotent by `providerEventId`: the payment webhook can be redelivered, and a second
 * row would pay a partner twice for one order. The counters and the audit row move in one
 * transaction, so a partner's totals can never disagree with the rows behind them.
 */
export async function recordAttribution(input: {
  providerEventId: string;
  code: string;
  eventId: string;
  organizerId: string;
  quantity: number;
  faceMinor: number;
  providerRef?: string;
  /** The buyer's email, so a partner buying through their own link earns nothing. */
  buyerEmail?: string;
}): Promise<AttributionResult> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' };

  const code = normaliseCode(input.code);
  const db = getAdminDb();
  const linkRef = db.collection(LINKS).doc(code);
  const rowRef = db.collection(ATTRIBUTIONS).doc(input.providerEventId);

  try {
    return await db.runTransaction<AttributionResult>(async (tx) => {
      const [linkSnap, rowSnap] = await Promise.all([tx.get(linkRef), tx.get(rowRef)]);

      if (rowSnap.exists) return { ok: false, reason: 'duplicate' };
      if (!linkSnap.exists) return { ok: false, reason: 'no-link' };

      const link = linkSnap.data() as PartnerLink;
      if (!link.active) return { ok: false, reason: 'inactive' };

      /*
       * Self-referral: a partner buying through their own link. Commission comes out of
       * the organiser's face-value payout, so a partner who clicks their own tracked link
       * and buys their own tickets is manufacturing a discount the organiser never agreed
       * to — up to the 50% cap, on every order. The buyer's email matching the link's
       * partner email is the signal; a colluding second account with a different email is
       * outside what an email guard can see, and is noted in STATUS as the residual.
       */
      if (
        input.buyerEmail &&
        link.partnerEmail &&
        input.buyerEmail.trim().toLowerCase() === link.partnerEmail.trim().toLowerCase()
      ) {
        return { ok: false, reason: 'self-referral' };
      }

      // A link scoped to one event earns on that event only. Without this a partner
      // given a link for a small show earns on the stadium date as well.
      if (link.eventId && link.eventId !== input.eventId) {
        return { ok: false, reason: 'wrong-event' };
      }
      if (link.organizerId !== input.organizerId) return { ok: false, reason: 'wrong-event' };

      /*
       * A spent allocation stops earning; it does not stop the sale. Refusing the
       * purchase would punish the customer for the promoter's cap, and the ticket is
       * inventory the organiser wanted sold either way.
       */
      if (link.allocation !== undefined && link.ticketsSold >= link.allocation) {
        return { ok: false, reason: 'allocation-spent' };
      }

      // Only the tickets inside the allocation earn, so the boundary order is split
      // rather than rounded in the partner's favour.
      const earning =
        link.allocation === undefined
          ? input.quantity
          : Math.max(0, Math.min(input.quantity, link.allocation - link.ticketsSold));

      const earningFaceMinor =
        input.quantity > 0 ? Math.round((input.faceMinor * earning) / input.quantity) : 0;
      const commissionMinor = Math.round((earningFaceMinor * link.commissionPercent) / 100);

      tx.set(rowRef, {
        id: input.providerEventId,
        code,
        organizerId: link.organizerId,
        eventId: input.eventId,
        quantity: earning,
        faceMinor: earningFaceMinor,
        commissionMinor,
        commissionPercent: link.commissionPercent,
        ...(input.providerRef ? { providerRef: input.providerRef } : {}),
        createdAt: new Date().toISOString(),
      } satisfies Attribution);

      tx.update(linkRef, {
        sales: link.sales + 1,
        ticketsSold: link.ticketsSold + earning,
        grossMinor: link.grossMinor + earningFaceMinor,
        commissionMinor: link.commissionMinor + commissionMinor,
      });

      return { ok: true, commissionMinor };
    });
  } catch (error) {
    reportError(error, { scope: 'partners.attribute', code });
    return { ok: false, reason: 'unavailable' };
  }
}

/** The rows behind a link's totals, for the organiser and for the partner's own page. */
export async function attributionsFor(code: string, limit = 200): Promise<Attribution[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(ATTRIBUTIONS)
      .where('code', '==', normaliseCode(code))
      .limit(limit)
      .get();
    return snap.docs
      .map((d) => d.data() as Attribution)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'partners.rows', code });
    return [];
  }
}
