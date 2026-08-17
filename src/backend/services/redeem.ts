import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { QR_VERSION, qrSigningInput, type TicketQrPayload } from '@/shared/tickets/qr';
import {
  ROTATION_SKEW,
  encodeRotationCode,
  rotationInput,
  rotationWindow,
} from '@/shared/tickets/rotating';
// Importing the guard here means the door cannot start with a drifted signing format.
import '@/backend/services/qr-contract';
import { reportError } from '@/backend/observability/report-error';
import { blockedBy } from '@/backend/services/blocklist';

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
 * Signing alone did not stop a forwarded screenshot — the rotating code below does, by
 * making the picture stale within thirty seconds. What neither fixes is somebody sharing
 * their account credentials, which is true of every ticketing platform.
 */

export type RedeemResult =
  | { ok: true; reference: string; attendee: string; tierName: string; seat?: string }
  | {
      ok: false;
      status: 400 | 401 | 403 | 404 | 409 | 503;
      kind:
        | 'already-used'
        | 'wrong-event'
        | 'invalid'
        | 'unsigned'
        | 'expired-code'
        | 'refunded'
        | 'blocked'
        | 'unavailable';
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

/**
 * The rotating code the wallet should be showing right now, for one window.
 *
 * Recomputed at the door from the ticket's own seed. Nothing about the code travels
 * anywhere except inside the QR, and the seed never leaves the ticket document.
 */
function rotationCodeFor(seed: string, ticketId: string, window: number): string {
  const mac = createHmac('sha256', seed).update(rotationInput(ticketId, window)).digest();
  return encodeRotationCode(new Uint8Array(mac));
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
        organizerId?: string;
        attendeeEmail?: string;
        rotationSeed?: string;
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

      /*
       * Rotating code.
       *
       * Only enforced when the ticket carries a seed, so tickets issued before rotation
       * existed still scan on their static signature. The current window plus one either
       * side is accepted: phones drift, and a customer with a slightly slow clock being
       * refused at a door is a worse outcome than a 30-second-wider forwarding window.
       *
       * A wallet that could not compute a code — no Web Crypto, insecure context — sends
       * none, and falls back to the signature that was already verified above. A ticket
       * that renders nothing is a person at a door with no way in.
       */
      if (ticket.rotationSeed && payload.c) {
        const now = rotationWindow();
        const windows = [];
        for (let d = -ROTATION_SKEW; d <= ROTATION_SKEW; d += 1) windows.push(now + d);

        const matched = windows.some((w) =>
          signaturesMatch(rotationCodeFor(ticket.rotationSeed!, payload.t, w), payload.c)
        );

        if (!matched) {
          return {
            ok: false,
            status: 400,
            kind: 'expired-code',
            error: 'That code has expired. Ask them to reopen the ticket for a fresh one.',
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

      /*
       * The blocklist, checked last — after everything that would refuse the ticket on
       * its own merits, and immediately before the write.
       *
       * A block **refuses the scan without touching the ticket**. It stays `valid`, so it
       * can still be refunded through the path that exists and works again the moment the
       * block is lifted. Cancelling it here would mean an argument at the front of a queue
       * permanently destroying something somebody paid for.
       *
       * Reading inside the transaction is safe because nothing here writes to the
       * blocklist; it is a read the transaction will re-run if the ticket changes under
       * it, which is exactly the behaviour wanted.
       */
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
