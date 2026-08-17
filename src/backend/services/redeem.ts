import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { QR_VERSION, qrSigningInput, type TicketQrPayload } from '@/shared/tickets/qr';
// Importing the guard here means the door cannot start with a drifted signing format.
import '@/backend/services/qr-contract';
import { reportError } from '@/backend/observability/report-error';

/**
 * Door redemption. Server-side, atomic, and authorised.
 *
 * Three things were wrong with doing this from the organiser's browser.
 *
 * 1. **It was not atomic.** `redeemTicket()` read the ticket, checked the status, then
 *    wrote `redeemed` in a separate operation. Two doors — or two staff phones on the
 *    same door — scanning one ticket at the same moment could both read `valid` and both
 *    admit. `firestore.rules` constrains the write to valid → redeemed, but rules are
 *    evaluated per request against the committed document; they are not a substitute for
 *    a transaction. This runs in one, so the second scan loses.
 *
 * 2. **The browser was the authority.** Nothing outside the client checked that the
 *    caller owned the event whose door they were operating.
 *
 * 3. **The payload was unauthenticated.** A genuine ticket's QR could be edited — swap
 *    the event id and probe another door, or substitute a guessed ticket id — and the
 *    scanner would obligingly query the database with it.
 *
 * What signing does not fix, and is not claimed to: a screenshot still works once. The
 * single-use transaction is what bounds it, and the terms of service describe exactly
 * that. Defeating a shared screenshot outright needs a rotating code, which is a
 * different feature and is not built.
 */

export type RedeemResult =
  | { ok: true; reference: string; attendee: string; tierName: string; seat?: string }
  | {
      ok: false;
      status: 400 | 401 | 403 | 404 | 409 | 503;
      kind: 'already-used' | 'wrong-event' | 'invalid' | 'unsigned' | 'refunded' | 'unavailable';
      error: string;
      reference?: string;
      redeemedAt?: string;
    };

function signatureFor(ticketId: string, eventId: string): string | undefined {
  const key = process.env.QR_SIGNING_KEY;
  if (!key) return undefined;
  return createHmac('sha256', key)
    .update(qrSigningInput(QR_VERSION, ticketId, eventId))
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time. A byte-by-byte compare leaks the signature one byte per attempt. */
function signaturesMatch(expected: string | undefined, given: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function redeemAtDoor(
  payload: TicketQrPayload,
  eventId: string,
  callerUid: string
): Promise<RedeemResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, kind: 'unavailable', error: 'Scanning is unavailable.' };
  }

  const db = getAdminDb();

  // Authorise the door before touching the ticket. The organiser who owns the event, or
  // an administrator. Checked server-side because the scanner page cannot be trusted to
  // have checked it.
  let isAdmin = false;
  try {
    const caller = await db.collection('users').doc(callerUid).get();
    const type = caller.data()?.userType;
    isAdmin = type === 'superuser';

    if (!isAdmin) {
      const event = await db.collection('events').doc(eventId).get();
      if (!event.exists) {
        return { ok: false, status: 404, kind: 'invalid', error: 'That event does not exist.' };
      }
      if (event.data()?.organizerId !== callerUid) {
        return {
          ok: false,
          status: 403,
          kind: 'invalid',
          error: 'You are not scanning for an event you own.',
        };
      }
    }
  } catch {
    return { ok: false, status: 503, kind: 'unavailable', error: 'Could not verify the door.' };
  }

  if (payload.e && payload.e !== eventId) {
    return {
      ok: false,
      status: 409,
      kind: 'wrong-event',
      error: 'That ticket is for a different event.',
      reference: payload.r,
    };
  }

  const ticketRef = db.collection('tickets').doc(payload.t);

  try {
    return await db.runTransaction<RedeemResult>(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) {
        return { ok: false, status: 404, kind: 'invalid', error: 'No such ticket.' };
      }

      const ticket = snap.data() as {
        eventId: string;
        reference: string;
        attendeeName?: string;
        tierName?: string;
        seat?: string;
        status: string;
        redeemedAt?: string;
        qrSignature?: string;
      };

      if (ticket.eventId !== eventId) {
        return {
          ok: false,
          status: 409,
          kind: 'wrong-event',
          error: 'That ticket is for a different event.',
          reference: ticket.reference,
        };
      }

      /*
       * Signature check, against the stored value AND a freshly computed one.
       *
       * Recomputing rather than trusting `ticket.qrSignature` alone means a signature
       * written under a rotated key, or copied onto a ticket by a database write that
       * should not have happened, still fails.
       */
      const expected = signatureFor(payload.t, ticket.eventId);
      if (expected) {
        if (!signaturesMatch(expected, payload.s) || !signaturesMatch(expected, ticket.qrSignature)) {
          return {
            ok: false,
            status: 400,
            kind: 'unsigned',
            error: 'That code did not verify. It may have been altered or issued before signing.',
            reference: ticket.reference,
          };
        }
      }

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

      if (ticket.status === 'refunded' || ticket.status === 'cancelled') {
        return {
          ok: false,
          status: 409,
          kind: 'refunded',
          error: `This ticket was ${ticket.status}.`,
          reference: ticket.reference,
        };
      }

      if (ticket.status !== 'valid') {
        return {
          ok: false,
          status: 409,
          kind: 'invalid',
          error: `This ticket is ${ticket.status}.`,
          reference: ticket.reference,
        };
      }

      tx.update(ticketRef, { status: 'redeemed', redeemedAt: new Date().toISOString() });

      return {
        ok: true,
        reference: ticket.reference,
        attendee: ticket.attendeeName ?? 'Attendee',
        tierName: ticket.tierName ?? 'Ticket',
        ...(ticket.seat ? { seat: ticket.seat } : {}),
      };
    });
  } catch (error) {
    reportError(error, { scope: 'redeem', ticketId: payload.t, eventId });
    return {
      ok: false,
      status: 503,
      kind: 'unavailable',
      error: 'Could not reach the ticket. Try again.',
    };
  }
}
