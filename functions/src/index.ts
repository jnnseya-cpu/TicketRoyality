import { initializeApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

import type { PaymentEventDoc, PaymentEventStatus, TicketDoc } from './domain';
import { isEmailConfigured, send } from './email';
import { issuanceFailedEmail, refundProcessedEmail, ticketIssuedEmail } from './templates';
import {
  PermanentIssuanceError,
  TransientIssuanceError,
  db,
  issueTickets,
  refundTickets,
} from './issuance';

initializeApp();

// Same region as Firestore and App Hosting. A function in a different region pays a
// cross-region round trip on every transaction read, which is the slowest part of
// issuance.
setGlobalOptions({ region: 'europe-west2', maxInstances: 10 });

/**
 * The SMTP password, from Cloud Secret Manager.
 *
 * Bound to the delivery function below, which is what injects it into `process.env` at
 * runtime. Non-secret mail settings live in `functions/.env`; this is the only value
 * that must never be in the repository.
 *
 *   firebase functions:secrets:set SMTP_PASSWORD
 */
const smtpPassword = defineSecret('SMTP_PASSWORD');
/*
 * The ticket-signing key, shared byte-for-byte with the app (apphosting.yaml). It was
 * never bound here, so every ticket this package issued was unsigned even when the
 * app's door held the key — which the door then refused wholesale until it learned to
 * accept legacy-unsigned tickets. Binding it makes new tickets verifiable end-to-end.
 */
const qrSigningKey = defineSecret('QR_SIGNING_KEY');

/** The canonical origin, for links in outbound mail. */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ticketroyality.com';
}

const PENDING: PaymentEventStatus[] = ['pending', 'processing'];

/** Attempts before a payment stops being retried and is escalated instead. */
const MAX_ATTEMPTS = 5;

/**
 * Finds the issued payment a refund refers to, by the identifier both events share.
 *
 * Returns the payment event id, which is also the key of the `issued_payments` marker
 * the reversal needs.
 */
async function findIssuedPaymentByRef(ref: string | undefined): Promise<string | undefined> {
  if (!ref) return undefined;

  const match = await db()
    .collection('payment_events')
    .where('providerRef', '==', ref)
    .where('intent', '==', 'issue')
    .limit(1)
    .get();

  return match.empty ? undefined : match.docs[0].id;
}

/**
 * Sends a one-off notice and records the outcome on the payment event.
 *
 * Never throws. A refund that succeeded must not be reported as failed because the
 * email bounced — the money has already moved, and turning a completed reversal into a
 * retryable error would put it through the whole path again.
 */
async function notify(
  ref: FirebaseFirestore.DocumentReference,
  to: string | undefined,
  email: { subject: string; text: string; html: string } | null
): Promise<void> {
  if (!email) return;

  if (!to || !to.includes('@')) {
    await ref.update({ notice: 'skipped:no-address' }).catch(() => {});
    return;
  }
  if (!isEmailConfigured()) {
    await ref.update({ notice: 'skipped:smtp-unconfigured' }).catch(() => {});
    return;
  }

  const outcome = await send({ to, ...email });
  if (outcome.status === 'sent') {
    logger.info('notice sent', { to, subject: email.subject });
    await ref.update({ notice: 'sent', noticeAt: new Date().toISOString() }).catch(() => {});
  } else {
    // Recorded rather than thrown. `notice` starting with `failed:` is the signal to
    // watch — a customer who was refunded and never told will contact support.
    logger.error('notice delivery failed', { to, subject: email.subject, reason: outcome.reason });
    await ref.update({ notice: `failed: ${outcome.reason}` }).catch(() => {});
  }
}

/**
 * Processes one payment event. Shared by the trigger and the reconciliation sweep, so
 * both paths have identical semantics — a sweep that behaves differently from the
 * trigger is a second implementation to keep correct.
 *
 * Not named `process`: that shadows the Node global at module scope, so every later
 * `process.env` in this file silently resolves to this function instead.
 */
/**
 * Exported for testing. This function *is* the payment loop — the step between a
 * verified webhook and a ticket in somebody's hand — and it was unreachable from a test,
 * which is precisely why the loop had never been exercised end to end. The triggers
 * below are thin wrappers around it.
 */
export async function processPaymentEvent(providerEventId: string): Promise<PaymentEventStatus> {
  const firestore = db();
  const ref = firestore.collection('payment_events').doc(providerEventId);
  const snap = await ref.get();

  if (!snap.exists) {
    logger.warn('payment event vanished', { providerEventId });
    return 'failed';
  }

  const payment = snap.data() as PaymentEventDoc;

  if (!PENDING.includes(payment.status)) return payment.status;

  const attempts = (payment.attempts ?? 0) + 1;
  await ref.update({ status: 'processing', attempts });

  const finish = async (status: PaymentEventStatus, extra: Record<string, unknown> = {}) => {
    await ref.update({ status, processedAt: new Date().toISOString(), ...extra });
    return status;
  };

  if (payment.intent === 'ignore') return finish('ignored');

  try {
    if (payment.intent === 'refund') {
      // A refund arrives as its own provider event, but the issuance marker it has to
      // reverse is keyed to the *original* payment. `refundsRef` is the identifier
      // both share — Stripe's payment intent id — so the original is found by query
      // rather than assumed.
      const originalId = await findIssuedPaymentByRef(payment.refundsRef);

      if (!originalId) {
        // Terminal. Either the payment was never issued through this system or the
        // reference is missing; retrying cannot conjure the link.
        logger.error('refund has no matching issuance', {
          providerEventId,
          refundsRef: payment.refundsRef,
        });
        return finish('failed', { reason: 'no matching issuance for refund' });
      }

      const { refunded, tickets } = await refundTickets(firestore, originalId, 'provider refund');
      logger.info('refund processed', { providerEventId, originalId, refunded });

      // `order.refund.processed` in the comms catalogue, and mandatory there: the
      // customer's money moved. Sent only when something was actually reversed, so a
      // replayed refund webhook does not email twice about one refund.
      if (refunded > 0) {
        await notify(
          ref,
          tickets[0]?.attendeeEmail ?? payment.attendeeEmail,
          refundProcessedEmail(tickets, siteUrl())
        );
      }

      return finish('refunded', { ticketsRefunded: refunded, reversed: originalId });
    }

    const { duplicate, ticketIds } = await issueTickets(firestore, providerEventId, payment);

    logger.info(duplicate ? 'issuance skipped (duplicate)' : 'tickets issued', {
      providerEventId,
      eventId: payment.eventId,
      quantity: payment.quantity,
      ticketIds: ticketIds.length,
    });

    return finish('issued', { ticketIds, duplicate });
  } catch (error) {
    if (error instanceof PermanentIssuanceError) {
      // Money has moved and no ticket can be issued. Loud, and terminal — retrying
      // would burn attempts against a condition that cannot improve.
      logger.error('issuance failed permanently — needs a refund and a human', {
        providerEventId,
        status: error.status,
        reason: error.message,
        userId: payment.userId,
        eventId: payment.eventId,
      });

      // `order.failed` / the oversold case. Money has moved and no ticket exists, which
      // from the buyer's side is indistinguishable from being defrauded. Silence here
      // is the single worst outcome on the platform, so they are told before they have
      // to ask.
      await notify(
        ref,
        payment.attendeeEmail,
        issuanceFailedEmail(
          {
            eventTitle: payment.eventId,
            quantity: payment.quantity,
            oversold: error.status === 'oversold',
          },
          siteUrl()
        )
      );

      return finish(error.status, { reason: error.message });
    }

    const reason = error instanceof Error ? error.message : String(error);

    if (attempts >= MAX_ATTEMPTS) {
      logger.error('issuance exhausted retries', { providerEventId, attempts, reason });
      return finish('failed', { reason: `exhausted after ${attempts} attempts: ${reason}` });
    }

    // Transient. Reset to pending so the sweep picks it up, then rethrow so the
    // platform's own retry runs too — whichever fires first wins, and the transaction
    // makes the loser a no-op.
    await ref.update({ status: 'pending', reason });
    logger.warn('issuance failed, will retry', { providerEventId, attempts, reason });
    throw error instanceof TransientIssuanceError ? error : new TransientIssuanceError(reason);
  }
}

/**
 * The issuance trigger.
 *
 * Fires on the document the webhook writes. Deliberately decoupled from the webhook
 * request: Stripe abandons a delivery that takes longer than a few seconds and marks
 * it failed, and a Firestore transaction under contention is exactly the thing that
 * occasionally takes longer than that. The webhook acknowledges in milliseconds and
 * this does the work with retries behind it.
 */
export const onPaymentEvent = onDocumentCreated(
  // SMTP_PASSWORD is bound here as well as on the delivery trigger: this function now
  // emails refund confirmations and issuance failures, and without the secret those
  // sends would silently record `skipped:smtp-unconfigured` — the customer whose
  // payment produced no ticket would be told nothing, which is the exact failure the
  // notice exists to prevent.
  {
    document: 'payment_events/{providerEventId}',
    retry: true,
    // qrSigningKey because this function issues tickets: without it every ticket comes
    // out unsigned and loses its tamper-binding at the door.
    secrets: [smtpPassword, qrSigningKey],
  },
  async (event) => {
    await processPaymentEvent(event.params.providerEventId);
  }
);

/**
 * Ticket delivery — `ticket.issued` in the comms catalogue.
 *
 * Triggered by the issuance marker rather than by ticket creation, so a buyer of four
 * tickets receives **one** email listing four references, not four emails.
 *
 * Separated from issuance on purpose. A ticket that is paid for and written to the
 * database must never be rolled back because an SMTP server was briefly unreachable,
 * and issuance has no way to fix a mail problem by retrying itself. Delivery therefore
 * fails and retries independently, and its outcome is recorded on the marker so
 * "did they get it?" is answerable without reading logs.
 */
export const onTicketsIssued = onDocumentCreated(
  { document: 'issued_payments/{providerEventId}', retry: true, secrets: [smtpPassword] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const marker = snap.data() as { ticketIds?: string[]; deliveredAt?: string };
    if (marker.deliveredAt) return;

    const ticketIds = marker.ticketIds ?? [];
    if (ticketIds.length === 0) return;

    const firestore = db();
    const refs = ticketIds.map((id) => firestore.collection('tickets').doc(id));
    const tickets = (await firestore.getAll(...refs))
      .filter((doc) => doc.exists)
      .map((doc) => doc.data() as TicketDoc);

    if (tickets.length === 0) {
      logger.error('issuance marker has no readable tickets', {
        providerEventId: event.params.providerEventId,
        ticketIds,
      });
      return;
    }

    const recipient = tickets[0].attendeeEmail;

    if (!recipient) {
      // Not a failure that retrying fixes. The ticket is valid and reachable in the
      // buyer's account; there is simply no address to send it to.
      logger.warn('tickets issued with no recipient email', {
        providerEventId: event.params.providerEventId,
        userId: tickets[0].userId,
      });
      await snap.ref.update({ delivery: 'skipped:no-address', deliveredAt: new Date().toISOString() });
      return;
    }

    /*
     * The fee snapshot lives on the payment document under the same id as this
     * marker. When present the email itemises face + fee + total paid, so the inbox
     * receipt agrees with what the checkout showed. Best-effort: an unreadable
     * payment doc costs the itemisation, never the ticket.
     */
    let fee: { serviceFee: number; totalPaid: number } | undefined;
    try {
      const payment = (
        await firestore.collection('payment_events').doc(event.params.providerEventId).get()
      ).data() as PaymentEventDoc | undefined;
      if (payment?.feeSnapshot && payment.feeSnapshot.buyerTotalMinor > 0) {
        fee = {
          serviceFee: payment.feeSnapshot.serviceFeeMinor / 100,
          totalPaid: payment.feeSnapshot.buyerTotalMinor / 100,
        };
      }
    } catch {
      // Face value only — the historical behaviour.
    }

    const email = ticketIssuedEmail(tickets, siteUrl(), fee);
    const outcome = await send({ to: recipient, ...email });

    if (outcome.status === 'failed') {
      // Recorded, then rethrown so the platform retries. This is the one message on the
      // platform where giving up silently is unacceptable: an unreachable ticket is
      // indistinguishable from fraud to the person who paid for it.
      await snap.ref.update({ delivery: `failed: ${outcome.reason}` });
      logger.error('ticket delivery failed', {
        providerEventId: event.params.providerEventId,
        reason: outcome.reason,
      });
      throw new Error(`ticket delivery failed: ${outcome.reason}`);
    }

    await snap.ref.update({
      delivery: outcome.status,
      deliveredAt: new Date().toISOString(),
      ...(outcome.status === 'sent' ? { messageId: outcome.messageId } : {}),
    });

    logger.info('ticket delivery', {
      providerEventId: event.params.providerEventId,
      status: outcome.status,
      tickets: tickets.length,
      emailConfigured: isEmailConfigured(),
    });
  }
);

/**
 * Reconciliation sweep.
 *
 * Firestore triggers are at-least-once, which is a guarantee about duplicates and not
 * about delivery: a trigger can be dropped. Without this, a dropped trigger is a
 * customer who paid and never received a ticket, and nobody finds out until they
 * complain. Runs often enough that the worst case is minutes rather than the event.
 */
export const reconcilePayments = onSchedule(
  // Same secrets, same reason: the sweep runs processPaymentEvent, so it issues (and
  // signs) tickets and can reach the same notice paths as the trigger.
  { schedule: 'every 10 minutes', timeoutSeconds: 300, secrets: [smtpPassword, qrSigningKey] },
  async () => {
    const firestore = db();

    // One minute of grace so this never races the trigger for a payment that has only
    // just arrived.
    const cutoff = new Date(Date.now() - 60_000).toISOString();

    const stale = await firestore
      .collection('payment_events')
      .where('status', 'in', PENDING)
      .where('receivedAt', '<', cutoff)
      .limit(50)
      .get();

    if (stale.empty) return;

    logger.info('reconciling stuck payments', { count: stale.size });

    for (const doc of stale.docs) {
      try {
        await processPaymentEvent(doc.id);
      } catch (error) {
        // Already logged and recorded on the document. Swallowed so one bad payment
        // does not stop the sweep reaching the other forty-nine.
        logger.warn('reconcile attempt failed', {
          providerEventId: doc.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
);

/**
 * Daily integrity check on inventory.
 *
 * Compares each tier's `sold` counter against the tickets actually issued against it.
 * The counter is a denormalisation and denormalisations drift; the tickets are the
 * truth. This only reports — silently correcting a discrepancy would destroy the
 * evidence of whatever caused it, and the cause is the interesting part.
 */
export const auditInventory = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Europe/London', timeoutSeconds: 540 },
  async () => {
    const firestore = db();
    const events = await firestore.collection('events').where('status', '==', 'published').get();

    let checked = 0;
    let drifted = 0;

    for (const eventDoc of events.docs) {
      const tiers = (eventDoc.data().ticketTiers ?? []) as { id: string; sold?: number }[];

      for (const tier of tiers) {
        const issued = await firestore
          .collection('tickets')
          .where('eventId', '==', eventDoc.id)
          .where('tierId', '==', tier.id)
          .where('status', 'in', ['valid', 'redeemed'])
          .count()
          .get();

        checked += 1;
        const actual = issued.data().count;

        if ((tier.sold ?? 0) !== actual) {
          drifted += 1;
          logger.error('inventory drift', {
            eventId: eventDoc.id,
            tierId: tier.id,
            counter: tier.sold ?? 0,
            actualTickets: actual,
          });
        }
      }
    }

    logger.info('inventory audit complete', { tiersChecked: checked, drifted });
  }
);

/**
 * Expires payment events that were never confirmed.
 *
 * A checkout that is abandoned leaves a pending intent. Left alone these accumulate
 * forever and make the reconciliation query slower every day.
 */
export const expireStalePayments = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Europe/London' },
  async () => {
    const firestore = db();
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    const stale = await firestore
      .collection('payment_events')
      .where('status', '==', 'failed')
      .where('receivedAt', '<', cutoff)
      .limit(200)
      .get();

    if (stale.empty) return;

    // Archived rather than deleted: these are records of payments that failed to
    // produce a ticket, which is precisely the history a dispute needs.
    const batch = firestore.batch();
    for (const doc of stale.docs) {
      batch.set(firestore.collection('payment_events_archive').doc(doc.id), {
        ...doc.data(),
        archivedAt: FieldValue.serverTimestamp(),
      });
      batch.delete(doc.ref);
    }
    await batch.commit();

    logger.info('archived failed payment events', { count: stale.size });
  }
);
