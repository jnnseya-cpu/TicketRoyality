import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { availableInTier } from '@/shared/pricing';
import { QR_VERSION, qrSigningInput } from '@/shared/tickets/qr';
import type { SeasonPass, TicketTier } from '@/shared/types';

/**
 * Season passes: one purchase, a ticket for every covered event.
 *
 * ## Issuance is the existing issuance, N times
 *
 * A settled pass writes one `payment_events` document per covered event, each with its
 * own idempotency key derived from the payment. The function that has always issued
 * tickets does the rest — same transaction, same oversell guard, same emails. There is
 * no second issuance path, which is the rule this codebase has kept through every
 * feature: hospitality, seats, and now this.
 *
 * A consequence worth stating: a pass consumes **real inventory** in each event, in the
 * tier the organiser chose. Twenty pass holders are twenty seats gone from each fixture,
 * counted the same way single tickets are, so a fixture cannot be quietly oversold by
 * people nobody added up.
 *
 * ## Availability is checked before the card, not after
 *
 * If one fixture in the run is sold out, the pass cannot be honoured — and finding that
 * out after taking the money means a refund and an apology. `passAvailability` is what
 * checkout calls first.
 */

const PASSES = 'season_passes';
const PURCHASES = 'season_pass_purchases';

export async function createPass(input: Omit<SeasonPass, 'id' | 'createdAt' | 'sold'>): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  if (!isAdminConfigured()) return { ok: false, error: 'Season passes are unavailable.' };

  if (input.eventIds.length === 0) return { ok: false, error: 'A pass has to cover something.' };
  // Every covered event needs a tier chosen, or issuance has nothing to consume and the
  // holder arrives at that fixture with no ticket.
  const missing = input.eventIds.filter((id) => !input.tierIds[id]);
  if (missing.length > 0) {
    return { ok: false, error: 'Choose which ticket type the pass takes in every event.' };
  }

  try {
    const ref = await getAdminDb()
      .collection(PASSES)
      .add({ ...input, sold: 0, createdAt: new Date().toISOString() });
    return { ok: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'passes.create', organizerId: input.organizerId });
    return { ok: false, error: 'Could not create that pass.' };
  }
}

export async function getPass(passId: string): Promise<SeasonPass | null> {
  if (!isAdminConfigured()) return null;
  try {
    const snap = await getAdminDb().collection(PASSES).doc(passId).get();
    return snap.exists ? ({ id: snap.id, ...(snap.data() as object) } as SeasonPass) : null;
  } catch (error) {
    reportError(error, { scope: 'passes.get', passId });
    return null;
  }
}

export async function listPasses(organizerId: string): Promise<SeasonPass[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(PASSES)
      .where('organizerId', '==', organizerId)
      .limit(100)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as SeasonPass);
  } catch (error) {
    reportError(error, { scope: 'passes.list', organizerId });
    return [];
  }
}

export type PassAvailability =
  | { ok: true; passesLeft: number }
  | { ok: false; reason: 'inactive' | 'sold-out' | 'fixture-full' | 'unavailable'; error: string };

/**
 * Can this pass still be honoured in full?
 *
 * Every covered fixture is checked, because a pass that covers ten nights and can only
 * seat somebody at nine is not a pass — it is a complaint with a receipt attached.
 */
export async function passAvailability(passId: string): Promise<PassAvailability> {
  const pass = await getPass(passId);
  if (!pass) return { ok: false, reason: 'unavailable', error: 'That pass no longer exists.' };
  if (!pass.active) return { ok: false, reason: 'inactive', error: 'That pass is not on sale.' };

  const passesLeft = pass.quantity - (pass.sold ?? 0);
  if (passesLeft <= 0) return { ok: false, reason: 'sold-out', error: 'Season passes have sold out.' };

  try {
    const db = getAdminDb();
    for (const eventId of pass.eventIds) {
      const snap = await db.collection('events').doc(eventId).get();
      const tier = (snap.data()?.ticketTiers as TicketTier[] | undefined)?.find(
        (t) => t.id === pass.tierIds[eventId]
      );
      if (!tier || availableInTier(tier) <= 0) {
        return {
          ok: false,
          reason: 'fixture-full',
          error: `${snap.data()?.title ?? 'One of the fixtures'} is full, so the pass cannot be honoured.`,
        };
      }
    }
    return { ok: true, passesLeft };
  } catch (error) {
    reportError(error, { scope: 'passes.availability', passId });
    return { ok: false, reason: 'unavailable', error: 'Could not check the fixtures.' };
  }
}

export type SettleResult =
  | { ok: true; issued: number }
  | { ok: false; reason: 'no-pass' | 'duplicate' | 'unavailable' };

/**
 * A paid pass becomes a ticket in every covered event.
 *
 * Each `payment_events` id is derived from the payment **and** the event, so one pass
 * purchase produces N independent, individually idempotent issuances. A redelivered
 * webhook re-derives the same ids and creates nothing.
 */
export async function settlePassPurchase(input: {
  providerEventId: string;
  passId: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  providerRef?: string;
}): Promise<SettleResult> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' };

  const db = getAdminDb();
  const pass = await getPass(input.passId);
  if (!pass) return { ok: false, reason: 'no-pass' };

  const purchaseRef = db.collection(PURCHASES).doc(input.providerEventId);

  // The price is spread evenly across the fixtures so a refund of one night reverses a
  // sensible share, rather than one ticket carrying the whole pass and the rest zero.
  const perEvent = pass.eventIds.length > 0 ? pass.price / pass.eventIds.length : 0;

  /*
   * Fixtures FIRST — each `recordPaymentEvent` is idempotent by `${id}__${eventId}`.
   *
   * The pass-level record used to be created before this loop as a whole-pass
   * idempotency gate, but that was actively harmful: if the loop threw part-way (a
   * transient Firestore error on fixture k) the webhook 500s and the provider
   * redelivers — and on redelivery the pass-level `create` failed with ALREADY_EXISTS
   * and short-circuited BEFORE the loop, so fixtures k…N were never recorded, never
   * issued, and never retried. The holder paid the full pass and silently received a
   * partial set of tickets. Running the idempotent fixtures first means a redelivery
   * re-runs and COMPLETES the set; the only non-idempotent action — the counter — is
   * gated separately below, after the fixtures are safely in.
   */
  let issued = 0;
  for (const eventId of pass.eventIds) {
    const outcome = await recordPaymentEvent({
      providerEventId: `${input.providerEventId}__${eventId}`,
      provider: 'stripe',
      providerType: 'season_pass',
      intent: 'issue',
      eventId,
      tierId: pass.tierIds[eventId],
      userId: input.userId,
      quantity: 1,
      price: Math.round(perEvent * 100) / 100,
      currency: pass.currency,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      providerRef: input.providerRef,
    });
    if (outcome === 'recorded') issued += 1;
  }

  /*
   * The pass counter, gated by the purchase record written LAST. On the first complete
   * settlement this creates the record and bumps `sold` once; a redelivery finds the
   * record present (code 6) and skips the bump — the fixtures above are ensured either
   * way, so a duplicate delivery is a success, not a short-circuit.
   */
  try {
    await purchaseRef.create({
      passId: input.passId,
      organizerId: pass.organizerId,
      userId: input.userId,
      email: input.attendeeEmail,
      eventIds: pass.eventIds,
      createdAt: new Date().toISOString(),
    });
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.collection(PASSES).doc(input.passId).update({ sold: FieldValue.increment(1) });
  } catch (error) {
    if ((error as { code?: number }).code !== 6) {
      reportError(error, { scope: 'passes.count', passId: input.passId });
    }
  }

  return { ok: true, issued };
}

/** Whether this person holds a pass covering this event — used to explain their ticket. */
export async function passesForUser(userId: string): Promise<
  Array<{ passId: string; organizerId: string; eventIds: string[] }>
> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(PURCHASES)
      .where('userId', '==', userId)
      .limit(50)
      .get();
    return snap.docs.map((d) => d.data() as { passId: string; organizerId: string; eventIds: string[] });
  } catch (error) {
    reportError(error, { scope: 'passes.forUser', userId });
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Whole-pass transfer — the sports card's "Not yet"                          */
/* -------------------------------------------------------------------------- */

const PASS_TRANSFERS = 'pass_transfers';

function hashPassToken(token: string): string {
  const salt = process.env.CRON_SECRET ?? 'ticketroyality-transfer';
  return createHmac('sha256', salt).update(token).digest('base64url');
}

function passTokensMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signPassTicket(ticketId: string, eventId: string): string | undefined {
  const key = process.env.QR_SIGNING_KEY;
  if (!key) return undefined;
  return createHmac('sha256', key)
    .update(qrSigningInput(QR_VERSION, ticketId, eventId))
    .digest('base64url')
    .slice(0, 32);
}

export type PassTransferStart =
  | { ok: true; transferId: string; ticketCount: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 503; error: string };

/**
 * Send a whole season pass to somebody else — every remaining fixture in one link.
 *
 * A pass was already transferable one fixture at a time, which for a 19-game season is
 * nineteen emails, nineteen links, and eighteen chances to miss one. This gathers what
 * the pass still covers — the holder's valid tickets for future fixtures on the pass's
 * tier — into one transfer with one link, accepted in one transaction.
 *
 * What moves is what remains: fixtures already attended stay in the sender's history,
 * because they attended them, and a used or refunded ticket is not the sender's to give.
 */
export async function startPassTransfer(
  passId: string,
  fromUserId: string,
  toEmail: string
): Promise<PassTransferStart> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Transfers are unavailable.' };

  const email = toEmail.trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, status: 400, error: 'Enter an email address.' };

  const db = getAdminDb();
  const pass = await getPass(passId);
  if (!pass) return { ok: false, status: 404, error: 'That pass no longer exists.' };

  try {
    /*
     * The holder's remaining tickets, fixture by fixture. Chunked because Firestore's
     * `in` takes at most 30 values; a pass longer than that is two queries, not a bug.
     */
    const ticketIds: string[] = [];
    let fromName = 'A pass holder';
    for (let i = 0; i < pass.eventIds.length; i += 30) {
      const chunk = pass.eventIds.slice(i, i + 30);
      const snap = await db
        .collection('tickets')
        .where('userId', '==', fromUserId)
        .where('eventId', 'in', chunk)
        .where('status', '==', 'valid')
        .get();

      for (const doc of snap.docs) {
        const ticket = doc.data() as {
          eventId: string;
          eventDate?: string;
          tierId?: string;
          attendeeName?: string;
        };
        // Only the pass's own tier counts: a separately bought GA ticket for the same
        // fixture is not part of the pass and must not ride along with it.
        if (ticket.tierId !== pass.tierIds[ticket.eventId]) continue;
        if (ticket.eventDate && new Date(ticket.eventDate).getTime() < Date.now()) continue;
        ticketIds.push(doc.id);
        fromName = ticket.attendeeName ?? fromName;
      }
    }

    if (ticketIds.length === 0) {
      return { ok: false, status: 409, error: 'Nothing left on this pass to transfer.' };
    }

    const pending = await db
      .collection(PASS_TRANSFERS)
      .where('passId', '==', passId)
      .where('fromUserId', '==', fromUserId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!pending.empty) {
      return { ok: false, status: 409, error: 'This pass already has a transfer waiting. Cancel it first.' };
    }

    const token = randomBytes(32).toString('base64url');
    const ref = await db.collection(PASS_TRANSFERS).add({
      passId,
      passName: pass.name,
      ticketIds,
      fromUserId,
      fromName,
      toEmail: email,
      tokenHash: hashPassToken(token),
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    await dispatch({
      eventKey: 'ticket.transferred_in',
      recipient: { email },
      vars: { actor: fromName, event: pass.name },
      body: [
        `${fromName} is sending you their season pass — ${pass.name}.`,
        `It covers ${ticketIds.length} remaining fixture${ticketIds.length === 1 ? '' : 's'}. Accept once and every one of them moves to your account.`,
      ],
      action: { label: 'Accept the pass', url: `${site}/passes/claim/${ref.id}?token=${token}` },
    }).catch(() => undefined);

    return { ok: true, transferId: ref.id, ticketCount: ticketIds.length };
  } catch (error) {
    reportError(error, { scope: 'passes.transfer.start', passId });
    return { ok: false, status: 503, error: 'That transfer could not be started.' };
  }
}

export type PassTransferAccept =
  | { ok: true; moved: number; passName: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410 | 503; error: string };

/**
 * Accept a whole pass: every remaining ticket moves in one transaction, or none do.
 *
 * Ticket by ticket would strand the recipient mid-season if anything failed halfway —
 * nine fixtures theirs, ten still the sender's, and nobody sure which. One transaction
 * re-owns every ticket, rotates every seed (each previous wallet code dies inside a
 * window), re-signs every QR, and marks the transfer accepted, atomically. A ticket
 * that was used or refunded since the link was sent simply does not move, and the count
 * says so — that is the sender's history, not a failure.
 */
export async function acceptPassTransfer(
  transferId: string,
  token: string,
  toUserId: string,
  toName: string,
  toEmail: string
): Promise<PassTransferAccept> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Transfers are unavailable.' };

  const db = getAdminDb();
  const ref = db.collection(PASS_TRANSFERS).doc(transferId);

  try {
    return await db.runTransaction<PassTransferAccept>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, status: 404, error: 'That transfer no longer exists.' };

      const transfer = snap.data() as {
        passId: string;
        passName: string;
        ticketIds: string[];
        fromUserId: string;
        tokenHash: string;
        status: string;
        expiresAt: string;
      };

      if (!passTokensMatch(transfer.tokenHash, hashPassToken(token))) {
        return { ok: false, status: 403, error: 'That link is not valid.' };
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

      const ticketRefs = transfer.ticketIds.map((id) => db.collection('tickets').doc(id));
      const tickets = await Promise.all(ticketRefs.map((t) => tx.get(t)));

      /*
       * Read before any write — Firestore transactions refuse reads after writes. The
       * holder record follows the tickets, so a loyalty presale sees the person who now
       * actually attends; the original buyer stays on the record as the money's history.
       */
      const purchases = await tx.get(
        db
          .collection(PURCHASES)
          .where('passId', '==', transfer.passId)
          .where('userId', '==', transfer.fromUserId)
          .limit(1)
      );

      let moved = 0;
      for (let i = 0; i < tickets.length; i += 1) {
        const ticketSnap = tickets[i];
        if (!ticketSnap.exists) continue;
        const ticket = ticketSnap.data() as { status: string; eventId: string; userId: string };
        // Used or refunded since the link was sent: the sender's history, not ours to move.
        if (ticket.status !== 'valid' || ticket.userId !== transfer.fromUserId) continue;

        tx.update(ticketRefs[i], {
          userId: toUserId,
          attendeeName: toName,
          attendeeEmail: toEmail,
          rotationSeed: randomBytes(32).toString('base64url'),
          ...(signPassTicket(ticketRefs[i].id, ticket.eventId)
            ? { qrSignature: signPassTicket(ticketRefs[i].id, ticket.eventId) }
            : {}),
          transferredAt: new Date().toISOString(),
          transferredFrom: transfer.fromUserId,
        });
        moved += 1;
      }

      if (moved === 0) {
        tx.update(ref, { status: 'expired', closedAt: new Date().toISOString() });
        return { ok: false, status: 409, error: 'Nothing left on that pass to accept.' };
      }

      if (!purchases.empty) {
        tx.update(purchases.docs[0].ref, {
          userId: toUserId,
          boughtByUserId: transfer.fromUserId,
        });
      }

      tx.update(ref, {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedByUserId: toUserId,
        movedCount: moved,
      });

      return { ok: true, moved, passName: transfer.passName };
    });
  } catch (error) {
    reportError(error, { scope: 'passes.transfer.accept', transferId });
    return { ok: false, status: 503, error: 'That transfer could not be completed.' };
  }
}

/** Cancel a pending pass transfer. Only the sender may. */
export async function cancelPassTransfer(transferId: string, byUserId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const db = getAdminDb();
  try {
    const snap = await db.collection(PASS_TRANSFERS).doc(transferId).get();
    if (!snap.exists) return false;
    const transfer = snap.data() as { fromUserId: string; status: string };
    if (transfer.fromUserId !== byUserId || transfer.status !== 'pending') return false;
    await snap.ref.update({ status: 'cancelled', closedAt: new Date().toISOString() });
    return true;
  } catch (error) {
    reportError(error, { scope: 'passes.transfer.cancel', transferId });
    return false;
  }
}
