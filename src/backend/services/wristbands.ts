import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { blockedBy } from '@/backend/services/blocklist';

/**
 * Wristbands and tags, without a sixth vendor.
 *
 * ## Why this needs no SDK and no contract
 *
 * Almost every cheap RFID and NFC reader sold for events is a **keyboard wedge**: present
 * a tag, and the reader types its UID and presses Enter, exactly as a barcode scanner
 * does. No driver, no API, no account. So the platform does not integrate a reader — it
 * accepts a typed UID, and the hardware stays the organiser's problem and the organiser's
 * property.
 *
 * What this deliberately does **not** do is integrate any specific manufacturer's SDK.
 * That would be a supplier relationship and a vendor decision, and it is not needed for
 * the common case.
 *
 * ## A tag is a bearer token, and the code says so
 *
 * A QR ticket carries a signature and a rotating code, so a screenshot is stale in thirty
 * seconds. A physical tag carries a UID and nothing else — there is no secret to rotate,
 * because the security is that the band is on somebody's wrist and staff put it there.
 *
 * That means a cloned UID admits. The honest mitigations are the ones a venue already
 * understands: bands are issued at the door, one tag binds to one ticket for one event,
 * and a band cannot be bound to a second ticket while the first binding stands. This is
 * not weaker than a wristband has ever been; it is exactly as strong, and the code does
 * not pretend otherwise.
 *
 * ## The redemption transaction is duplicated on purpose
 *
 * It would be smaller to add a `skipSignatureChecks` flag to the QR door. It would also
 * be one boolean away from turning the QR path into a bearer path. A separate function
 * that never had those checks cannot have them accidentally disabled.
 */

const BANDS = 'wristbands';

/** Readers differ on case and padding; the door must not care which one was bought. */
export function normaliseTag(uid: string): string {
  return uid.trim().toUpperCase().replace(/[\s:-]/g, '');
}

function bandId(eventId: string, uid: string): string {
  return `${eventId}__${normaliseTag(uid)}`;
}

export type BindResult =
  | { ok: true; ticketId: string; reference: string; attendee: string }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409 | 503;
      kind: 'no-ticket' | 'tag-taken' | 'already-bound' | 'not-yours' | 'unavailable';
      error: string;
    };

/**
 * Bind a tag to a ticket, at the point a band goes on a wrist.
 *
 * Both directions are one-to-one: a tag cannot be bound to a second ticket, and a ticket
 * cannot be given a second tag. The first stops one band admitting two people; the second
 * stops a lost band being quietly replaced without anyone unbinding the old one, which
 * would leave two live bands for one ticket.
 */
export async function bindTag(
  eventId: string,
  tagUid: string,
  ticketReference: string,
  callerUid: string
): Promise<BindResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, kind: 'unavailable', error: 'Wristbands are unavailable.' };
  }

  const uid = normaliseTag(tagUid);
  if (!uid) return { ok: false, status: 400, kind: 'unavailable', error: 'No tag read.' };

  const db = getAdminDb();

  try {
    const event = await db.collection('events').doc(eventId).get();
    if (!event.exists) {
      return { ok: false, status: 404, kind: 'no-ticket', error: 'That event does not exist.' };
    }

    const isOwner = event.data()?.organizerId === callerUid;
    const isAdmin =
      (await db.collection('users').doc(callerUid).get()).data()?.userType === 'superuser';
    if (!isOwner && !isAdmin) {
      return { ok: false, status: 403, kind: 'not-yours', error: 'That is not your event.' };
    }

    // By reference, because that is what is printed on the ticket the person is holding.
    const found = await db
      .collection('tickets')
      .where('eventId', '==', eventId)
      .where('reference', '==', ticketReference.trim().toUpperCase())
      .limit(1)
      .get();

    if (found.empty) {
      return { ok: false, status: 404, kind: 'no-ticket', error: 'No ticket with that reference.' };
    }

    const ticket = found.docs[0];
    const data = ticket.data() as { status: string; attendeeName?: string; reference: string };

    if (data.status !== 'valid' && data.status !== 'redeemed') {
      return {
        ok: false,
        status: 409,
        kind: 'no-ticket',
        error: `That ticket is ${data.status}.`,
      };
    }

    // One tag per ticket. A second band for the same ticket means two live bands.
    const existing = await db
      .collection(BANDS)
      .where('eventId', '==', eventId)
      .where('ticketId', '==', ticket.id)
      .limit(1)
      .get();

    if (!existing.empty) {
      return {
        ok: false,
        status: 409,
        kind: 'already-bound',
        error: 'That ticket already has a band. Unbind it first.',
      };
    }

    // `create` so the tag itself is unique by construction — the database refuses the
    // second binding rather than a check that read a moment too early.
    await db.collection(BANDS).doc(bandId(eventId, uid)).create({
      eventId,
      tagUid: uid,
      ticketId: ticket.id,
      reference: data.reference,
      boundAt: new Date().toISOString(),
      boundBy: callerUid,
    });

    return {
      ok: true,
      ticketId: ticket.id,
      reference: data.reference,
      attendee: data.attendeeName ?? 'Attendee',
    };
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      return {
        ok: false,
        status: 409,
        kind: 'tag-taken',
        error: 'That band is already on somebody else at this event.',
      };
    }
    reportError(error, { scope: 'wristband.bind', eventId });
    return { ok: false, status: 503, kind: 'unavailable', error: 'Could not bind that band.' };
  }
}

/** Releasing a band — a lost one, or the same band reused at a later event. */
export async function unbindTag(
  eventId: string,
  tagUid: string,
  callerUid: string
): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    const db = getAdminDb();
    const event = await db.collection('events').doc(eventId).get();
    if (event.data()?.organizerId !== callerUid) return false;

    await db.collection(BANDS).doc(bandId(eventId, tagUid)).delete();
    return true;
  } catch (error) {
    reportError(error, { scope: 'wristband.unbind', eventId });
    return false;
  }
}

export type TagAdmitResult =
  | { ok: true; reference: string; attendee: string; tierName: string; seat?: string }
  | {
      ok: false;
      status: 403 | 404 | 409 | 503;
      kind: 'unknown-tag' | 'already-used' | 'refunded' | 'blocked' | 'not-yours' | 'unavailable';
      error: string;
      reference?: string;
      redeemedAt?: string;
    };

/**
 * Admit somebody by their band.
 *
 * The same transaction shape as the QR door — authorise, read, check, write, once — minus
 * the signature and rotating-code checks, which do not exist for a physical tag and are
 * not silently skipped: this function never had them.
 */
export async function admitByTag(
  eventId: string,
  tagUid: string,
  callerUid: string
): Promise<TagAdmitResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, kind: 'unavailable', error: 'The door is unavailable.' };
  }

  const db = getAdminDb();

  try {
    const event = await db.collection('events').doc(eventId).get();
    if (!event.exists) {
      return { ok: false, status: 404, kind: 'unknown-tag', error: 'That event does not exist.' };
    }

    const organizerId = event.data()?.organizerId as string | undefined;
    const isAdmin =
      (await db.collection('users').doc(callerUid).get()).data()?.userType === 'superuser';
    if (organizerId !== callerUid && !isAdmin) {
      return { ok: false, status: 403, kind: 'not-yours', error: 'That is not your door.' };
    }

    const band = await db.collection(BANDS).doc(bandId(eventId, tagUid)).get();
    if (!band.exists) {
      return {
        ok: false,
        status: 404,
        kind: 'unknown-tag',
        error: 'That band is not registered for this event.',
      };
    }

    const ticketRef = db.collection('tickets').doc((band.data() as { ticketId: string }).ticketId);

    return await db.runTransaction<TagAdmitResult>(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) {
        return { ok: false, status: 404, kind: 'unknown-tag', error: 'That ticket no longer exists.' };
      }

      const ticket = snap.data() as {
        status: string;
        reference: string;
        attendeeName?: string;
        attendeeEmail?: string;
        tierName?: string;
        seat?: string;
        redeemedAt?: string;
        organizerId?: string;
      };

      if (ticket.status === 'redeemed') {
        return {
          ok: false,
          status: 409,
          kind: 'already-used',
          error: 'Already scanned.',
          reference: ticket.reference,
          redeemedAt: ticket.redeemedAt,
        };
      }
      if (ticket.status !== 'valid') {
        return {
          ok: false,
          status: 409,
          kind: 'refunded',
          error: `That ticket was ${ticket.status}.`,
          reference: ticket.reference,
        };
      }

      // The blocklist applies to a band exactly as it applies to a QR — a barred person
      // holding a wristband is the case it was built for.
      const block = await blockedBy(
        ticket.organizerId ?? '',
        eventId,
        ticket.reference,
        ticket.attendeeEmail
      );
      if (block) {
        return {
          ok: false,
          status: 403,
          kind: 'blocked',
          error: `Refused — ${block.reason}`,
          reference: ticket.reference,
        };
      }

      tx.update(ticketRef, {
        status: 'redeemed',
        redeemedAt: new Date().toISOString(),
        redeemedByTag: normaliseTag(tagUid),
      });

      return {
        ok: true,
        reference: ticket.reference,
        attendee: ticket.attendeeName ?? 'Attendee',
        tierName: ticket.tierName ?? 'Ticket',
        ...(ticket.seat ? { seat: ticket.seat } : {}),
      };
    });
  } catch (error) {
    reportError(error, { scope: 'wristband.admit', eventId });
    return { ok: false, status: 503, kind: 'unavailable', error: 'Could not reach the door.' };
  }
}

/** How many bands are issued, for the organiser's board. */
export async function bandsIssued(eventId: string): Promise<number> {
  if (!isAdminConfigured()) return 0;
  try {
    const snap = await getAdminDb().collection(BANDS).where('eventId', '==', eventId).limit(20_000).get();
    return snap.size;
  } catch (error) {
    reportError(error, { scope: 'wristband.count', eventId });
    return 0;
  }
}
