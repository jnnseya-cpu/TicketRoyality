import 'server-only';

import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * The two things an administrator can *do* about what the operations console shows.
 *
 * A console that only reads is half a tool. "Owed a refund: 3" told an operator that
 * three people paid and got nothing, then left them to find the payment in Firestore by
 * hand. These are the two recoveries that do not involve moving money, so they are the
 * two that can safely live behind a button.
 *
 * Refunds are deliberately **not** here. Issuing one means calling Stripe or KODA to
 * move real money, and a one-click reversal in an admin console — no amount shown, no
 * second confirmation, no idempotency key chosen by the operator — is how a mis-click
 * becomes a double refund. That belongs behind its own deliberate flow.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 404 | 409 | 503; error: string };

/**
 * Hand a payment event back to the reconciliation sweep.
 *
 * `reconcilePayments` runs every ten minutes over anything in `pending` or `processing`
 * older than a minute, so resetting the status is all that is needed — and it is safer
 * than invoking issuance directly from here, because the sweep is the path that is
 * already tested. Issuance is idempotent by document id, so a retry that races the
 * sweep cannot issue twice.
 *
 * The attempt counter is reset because `failed` means "gave up after five"; leaving it
 * at five would make the retry give up immediately.
 */
export async function retryPaymentEvent(id: string): Promise<ActionResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };
  if (!id) return { ok: false, status: 400, error: 'No payment event given.' };

  const db = getAdminDb();
  const ref = db.collection('payment_events').doc(id);

  try {
    const doc = await ref.get();
    if (!doc.exists) return { ok: false, status: 404, error: 'That payment event no longer exists.' };

    const status = (doc.data() as { status?: string }).status;
    if (status === 'issued') {
      return { ok: false, status: 409, error: 'That payment already issued its tickets.' };
    }

    await ref.update({
      status: 'pending',
      attempts: 0,
      reason: null,
      retriedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      message:
        'Queued for retry. The reconciliation sweep runs every ten minutes and will pick it up — refresh this page after that to see the outcome.',
    };
  } catch (error) {
    console.error('[operations] retry failed', { id, error: String(error) });
    return { ok: false, status: 503, error: 'Could not queue that payment for retry.' };
  }
}

/**
 * Send the buyer their tickets again.
 *
 * Built here rather than reusing `functions/src/templates.ts`: `functions/` is a
 * separate deployable package and the app cannot import from it. This is the plainer
 * catalogue layout rather than the bespoke ticket email, which is the right trade —
 * someone who never received their ticket needs it now, not art-directed.
 */
export async function resendTicketEmail(id: string): Promise<ActionResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };
  if (!id) return { ok: false, status: 400, error: 'No issued payment given.' };

  const db = getAdminDb();
  const ref = db.collection('issued_payments').doc(id);

  try {
    const doc = await ref.get();
    if (!doc.exists) return { ok: false, status: 404, error: 'That issued payment no longer exists.' };

    const ticketIds = (doc.data() as { ticketIds?: string[] }).ticketIds ?? [];
    if (ticketIds.length === 0) {
      return { ok: false, status: 409, error: 'That payment issued no tickets to send.' };
    }

    const tickets = (
      await db.getAll(...ticketIds.map((ticketId) => db.collection('tickets').doc(ticketId)))
    )
      .filter((snap) => snap.exists)
      .map((snap) => snap.data() as Record<string, unknown>);

    const recipient = tickets.find((t) => typeof t.attendeeEmail === 'string' && t.attendeeEmail)
      ?.attendeeEmail as string | undefined;

    if (!recipient) {
      // This is the whole reason `skipped:no-address` exists. Retrying cannot invent an
      // address, and saying so beats a button that appears to work and does nothing.
      return {
        ok: false,
        status: 409,
        error:
          'There is no email address on these tickets, which is why nothing was sent. The buyer can still see them in their account.',
      };
    }

    const eventName = String(tickets[0]?.eventTitle ?? 'your event');
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ticketroyality.com';

    const result = await dispatch({
      eventKey: 'ticket.issued',
      recipient: { email: recipient },
      vars: { event: eventName, count: tickets.length },
      body: [
        `Here are your ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for ${eventName}.`,
        'Open your account to show the QR code at the door. This is a resend — if you already received these tickets, they are the same ones and nothing has changed.',
      ],
      action: { label: 'View my tickets', url: `${site}/dashboard/customer#tickets` },
    });

    const email = result.records.find((d) => d.channel === 'email');

    if (!email || email.status === 'failed') {
      await ref.update({ delivery: `failed: ${email?.error ?? 'resend failed'}` });
      return {
        ok: false,
        status: 503,
        error: `Send failed: ${email?.error ?? 'unknown error'}. Check the SMTP credentials.`,
      };
    }

    if (email.status !== 'sent') {
      return {
        ok: false,
        status: 503,
        error: `Not sent — ${email.status}${email.error ? `: ${email.error}` : ''}.`,
      };
    }

    await ref.update({ delivery: 'sent', deliveredAt: new Date().toISOString() });
    return { ok: true, message: `Tickets re-sent to ${recipient}.` };
  } catch (error) {
    console.error('[operations] resend failed', { id, error: String(error) });
    return { ok: false, status: 503, error: 'Could not resend those tickets.' };
  }
}
