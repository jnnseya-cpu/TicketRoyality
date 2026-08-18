import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { QR_VERSION, qrSigningInput } from '@/shared/tickets/qr';

/**
 * Ticket transfer.
 *
 * ## The property that makes this real
 *
 * Reassigning `userId` is the easy half and, on its own, is theatre: the previous holder
 * still has the ticket open on their phone, and their QR still scans. A transfer that
 * leaves two working copies is worse than no transfer, because now two people believe
 * they are getting in and the platform sold one seat.
 *
 * So accepting a transfer **rotates the ticket's rotation seed**. Every code the old
 * holder's wallet can compute stops matching within one 30-second window, and their
 * screenshot was already dead. This is the first feature that depends on rotating codes
 * existing, and it is why they were worth building first.
 *
 * A ticket that somehow has no seed gets one minted here, because without a seed the old
 * holder's static signature would keep working and the transfer would be exactly the
 * theatre described above.
 *
 * ## Why a token and not just a recipient id
 *
 * The recipient may not have an account yet — most people receiving a ticket from a
 * friend do not. The transfer is addressed to an email and carries a signed token, so it
 * survives the recipient registering, and the link cannot be guessed by someone who
 * knows the ticket reference.
 *
 * ## What is refused
 *
 * A redeemed ticket — the holder is already inside. A refunded or cancelled one. A
 * ticket for an event that has already started, because a transfer landing mid-event is
 * indistinguishable from a dispute at the door. And transferring to yourself, which is
 * a no-op that would still rotate the seed and log the old holder out of their own
 * ticket.
 */

const TRANSFER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface TicketTransfer {
  ticketId: string;
  eventId: string;
  fromUserId: string;
  fromName: string;
  toEmail: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
}

export type StartResult =
  | { ok: true; transferId: string; token: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 503; error: string };

export type AcceptResult =
  | { ok: true; ticketId: string; eventTitle: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410 | 503; error: string };

/** Tokens are stored hashed. A leaked database should not hand over working transfer links. */
function hashToken(token: string): string {
  const salt = process.env.CRON_SECRET ?? 'ticketroyality-transfer';
  return createHmac('sha256', salt).update(token).digest('base64url');
}

function tokensMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signTicket(ticketId: string, eventId: string): string | undefined {
  const key = process.env.QR_SIGNING_KEY;
  if (!key) return undefined;
  return createHmac('sha256', key)
    .update(qrSigningInput(QR_VERSION, ticketId, eventId))
    .digest('base64url')
    .slice(0, 32);
}

export async function startTransfer(
  ticketId: string,
  fromUserId: string,
  toEmail: string
): Promise<StartResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Transfers are unavailable.' };

  const email = toEmail.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, status: 400, error: 'Enter the email address to send it to.' };
  }

  const db = getAdminDb();

  try {
    const snap = await db.collection('tickets').doc(ticketId).get();
    if (!snap.exists) return { ok: false, status: 404, error: 'No such ticket.' };

    const ticket = snap.data() as {
      userId: string;
      eventId: string;
      eventTitle: string;
      eventDate: string;
      attendeeName: string;
      attendeeEmail: string;
      status: string;
    };

    if (ticket.userId !== fromUserId) {
      return { ok: false, status: 403, error: 'That is not your ticket.' };
    }
    if (ticket.status === 'redeemed') {
      return { ok: false, status: 409, error: 'That ticket has already been scanned.' };
    }
    if (ticket.status !== 'valid') {
      return { ok: false, status: 409, error: `That ticket is ${ticket.status}.` };
    }
    if (ticket.attendeeEmail?.toLowerCase() === email) {
      return { ok: false, status: 400, error: 'That ticket is already yours.' };
    }
    if (new Date(ticket.eventDate).getTime() < Date.now()) {
      return { ok: false, status: 409, error: 'That event has already started.' };
    }

    // One live transfer per ticket. Two pending links would let the sender promise the
    // same seat to two people, and whoever clicked first would win a race neither knew
    // they were in.
    const existing = await db
      .collection('ticket_transfers')
      .where('ticketId', '==', ticketId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existing.empty) {
      return {
        ok: false,
        status: 409,
        error: 'This ticket already has a transfer waiting. Cancel it first.',
      };
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();

    const ref = await db.collection('ticket_transfers').add({
      ticketId,
      eventId: ticket.eventId,
      fromUserId,
      fromName: ticket.attendeeName ?? 'A friend',
      toEmail: email,
      status: 'pending',
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TRANSFER_WINDOW_MS).toISOString(),
    } satisfies TicketTransfer);

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ticketroyality.com';
    const url = `${site}/tickets/transfer/${ref.id}?t=${token}`;

    await dispatch({
      eventKey: 'ticket.transferred_in',
      recipient: { email },
      vars: { actor: ticket.attendeeName ?? 'A friend', event: ticket.eventTitle },
      body: [
        `${ticket.attendeeName ?? 'Someone'} has sent you a ticket for ${ticket.eventTitle}.`,
        'Open the link below to accept it. The ticket moves to your account and stops working on theirs.',
        'This link expires in seven days.',
      ],
      action: { label: 'Accept the ticket', url },
    }).catch(() => undefined);

    await dispatch({
      eventKey: 'ticket.transferred_out',
      recipient: { email: ticket.attendeeEmail, userId: fromUserId },
      vars: { recipient: email, event: ticket.eventTitle },
      body: [
        `You sent your ticket for ${ticket.eventTitle} to ${email}.`,
        'It stays yours until they accept. You can cancel from your ticket at any point before that.',
      ],
    }).catch(() => undefined);

    return { ok: true, transferId: ref.id, token };
  } catch (error) {
    reportError(error, { scope: 'transfer.start', ticketId });
    return { ok: false, status: 503, error: 'Could not start that transfer.' };
  }
}

/**
 * Accept, in one transaction.
 *
 * The ticket moves and the seed rotates together. Splitting them leaves a window in
 * which two wallets hold working codes for one seat, which is the whole failure this
 * feature has to avoid.
 */
export async function acceptTransfer(
  transferId: string,
  token: string,
  toUserId: string,
  toName: string,
  toEmail: string
): Promise<AcceptResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Transfers are unavailable.' };

  const db = getAdminDb();
  const transferRef = db.collection('ticket_transfers').doc(transferId);

  try {
    const result = await db.runTransaction<AcceptResult>(async (tx) => {
      const snap = await tx.get(transferRef);
      if (!snap.exists) return { ok: false, status: 404, error: 'That transfer no longer exists.' };

      const transfer = snap.data() as TicketTransfer;

      if (!tokensMatch(transfer.tokenHash, hashToken(token))) {
        return { ok: false, status: 403, error: 'That link is not valid.' };
      }
      if (transfer.status === 'accepted') {
        return { ok: false, status: 409, error: 'That ticket has already been accepted.' };
      }
      if (transfer.status !== 'pending') {
        return { ok: false, status: 410, error: `That transfer was ${transfer.status}.` };
      }
      if (new Date(transfer.expiresAt).getTime() < Date.now()) {
        return { ok: false, status: 410, error: 'That link has expired. Ask them to send it again.' };
      }
      if (transfer.fromUserId === toUserId) {
        return { ok: false, status: 400, error: 'You cannot accept your own transfer.' };
      }

      const ticketRef = db.collection('tickets').doc(transfer.ticketId);
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) return { ok: false, status: 404, error: 'That ticket no longer exists.' };

      const ticket = ticketSnap.data() as {
        status: string;
        eventId: string;
        eventTitle: string;
        userId: string;
      };

      // Checked again inside the transaction: the sender may have used the ticket, or
      // had it refunded, in the days since the link was sent.
      if (ticket.status !== 'valid') {
        return { ok: false, status: 409, error: `That ticket is ${ticket.status} and cannot move.` };
      }
      if (ticket.userId !== transfer.fromUserId) {
        return { ok: false, status: 409, error: 'That ticket has already moved on.' };
      }

      tx.update(ticketRef, {
        userId: toUserId,
        attendeeName: toName,
        attendeeEmail: toEmail,
        // The point of the whole feature. Every code the previous holder's wallet can
        // compute stops matching inside one 30-second window.
        rotationSeed: randomBytes(32).toString('base64url'),
        // Re-derived rather than carried: the signature covers ticket and event, so it
        // is unchanged in value, but writing it keeps a ticket that predates signing
        // from arriving in a new account still unsigned.
        ...(signTicket(transfer.ticketId, ticket.eventId)
          ? { qrSignature: signTicket(transfer.ticketId, ticket.eventId) }
          : {}),
        transferredAt: new Date().toISOString(),
        transferredFrom: transfer.fromUserId,
      });

      tx.update(transferRef, {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedByUserId: toUserId,
      });

      return { ok: true, ticketId: transfer.ticketId, eventTitle: ticket.eventTitle };
    });

    if (result.ok) {
      const transfer = (await transferRef.get()).data() as TicketTransfer;
      await dispatch({
        eventKey: 'ticket.transferred_out',
        recipient: { userId: transfer.fromUserId },
        vars: { recipient: toEmail, event: result.eventTitle },
        body: [
          `${toName} accepted your ticket for ${result.eventTitle}.`,
          'It is now in their account and no longer scans on yours.',
        ],
      }).catch(() => undefined);

      // docs/25 §76 — integrators hear ownership change the moment it happens.
      const ticket = (await db.collection('tickets').doc(result.ticketId).get()).data() as
        | { organizerId?: string; eventId?: string }
        | undefined;
      if (ticket?.organizerId) {
        const { queueEvent } = await import('@/backend/services/webhooks');
        await queueEvent(ticket.organizerId, 'ticket.transferred', {
          ticketId: result.ticketId,
          eventId: ticket.eventId,
          fromUserId: transfer.fromUserId,
          toUserId,
        }).catch(() => undefined);
      }
    }

    return result;
  } catch (error) {
    reportError(error, { scope: 'transfer.accept', transferId });
    return { ok: false, status: 503, error: 'Could not accept that transfer.' };
  }
}

/** The sender changing their mind, while it is still pending. */
export async function cancelTransfer(transferId: string, byUserId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const ref = getAdminDb().collection('ticket_transfers').doc(transferId);
    const snap = await ref.get();
    if (!snap.exists) return false;

    const transfer = snap.data() as TicketTransfer;
    if (transfer.fromUserId !== byUserId || transfer.status !== 'pending') return false;

    await ref.update({ status: 'cancelled' });
    return true;
  } catch (error) {
    reportError(error, { scope: 'transfer.cancel', transferId });
    return false;
  }
}
