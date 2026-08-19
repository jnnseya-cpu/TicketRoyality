import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { SEAT_LOCKS, seatLockId } from '@/backend/services/holds';
import { seatBelongsToTier } from '@/shared/seating';
import { tierSaleWindow } from '@/shared/pricing';
import type { SeatingSection, TicketTier } from '@/shared/types';

/**
 * Moving after the sale.
 *
 * ## Why this cannot be an update
 *
 * "Set this ticket's seat to F12" is one write, and two people doing it at the same
 * moment both succeed — which is exactly the double sale the seat lock was built to
 * prevent, arriving through a different door. A move is therefore a transaction that
 * claims the destination the same way checkout does: by creating a lock document whose id
 * is the seat, so the database refuses the second claim rather than a check that read a
 * moment too early.
 *
 * The lock is then released inside the same transaction, because a ticket now carries the
 * seat and `takenSeats` derives availability from tickets. Creating and deleting the lock
 * in one transaction looks redundant and is not: `create` is the exclusion, and holding it
 * afterwards would make the seat permanently unsellable if the move were ever rolled back.
 *
 * ## Two operations, because they are different promises
 *
 * `moveSeat` takes a free seat. `exchangeSeats` swaps two people who have both agreed —
 * neither seat is free at any point, so the free-seat path cannot express it, and doing it
 * as two moves would leave one person seatless in between if the second half failed.
 *
 * ## What a move deliberately does not do
 *
 * It does not touch money. Moving from a £20 seat to a £200 seat is an upgrade, and an
 * upgrade is a payment — so a move is confined to seats **on the ticket's own tier**.
 * Anything else is a refund and a repurchase, which is honest, auditable, and already
 * built.
 */

export type SwapResult =
  | { ok: true; seat: string; previousSeat?: string }
  | {
      ok: false;
      reason: 'no-ticket' | 'not-yours' | 'not-live' | 'seat-taken' | 'wrong-tier' | 'unavailable';
      error: string;
    };

function refuse(reason: Exclude<SwapResult, { ok: true }>['reason'], error: string): SwapResult {
  return { ok: false, reason, error };
}

interface TicketShape {
  eventId: string;
  userId: string;
  tierId?: string;
  status: string;
  seat?: string;
}

/**
 * Move one ticket to a free seat.
 *
 * `actorId` is the person asking: the ticket holder, or the event's organiser doing it at
 * the box office. A redeemed ticket cannot move — the holder is already inside and sitting
 * somewhere, and rewriting the seat then only makes the record disagree with the room.
 */
export async function moveSeat(
  ticketId: string,
  toSeat: string,
  actorId: string
): Promise<SwapResult> {
  if (!isAdminConfigured()) return refuse('unavailable', 'Seat changes are unavailable.');

  const seat = toSeat.trim().toUpperCase();
  if (!seat) return refuse('seat-taken', 'Choose a seat.');

  const db = getAdminDb();
  const ticketRef = db.collection('tickets').doc(ticketId);
  /** Captured inside the transaction for the webhook after it commits. */
  let movedContext: { organizerId: string; eventId: string } | null = null;

  try {
    const outcome = await db.runTransaction<SwapResult>(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) return refuse('no-ticket', 'That ticket no longer exists.');

      const ticket = snap.data() as TicketShape;
      const eventRef = db.collection('events').doc(ticket.eventId);
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) return refuse('no-ticket', 'That event no longer exists.');

      const event = eventSnap.data() ?? {};
      const isHolder = ticket.userId === actorId;
      const isOrganiser = event.organizerId === actorId;
      if (!isHolder && !isOrganiser) {
        return refuse('not-yours', 'That ticket is not yours to move.');
      }

      if (ticket.status !== 'valid') {
        return refuse(
          'not-live',
          ticket.status === 'redeemed'
            ? 'That ticket has already been used at the door.'
            : 'That ticket is no longer valid.'
        );
      }

      if (ticket.seat && ticket.seat.trim().toUpperCase() === seat) {
        // Asking for the seat you are already in is not an error worth a refusal page.
        return { ok: true, seat, previousSeat: seat };
      }

      const sections = (event.seating ?? []) as SeatingSection[];
      if (sections.length === 0) return refuse('wrong-tier', 'This event has no seat map.');

      if (!seatBelongsToTier(sections, ticket.tierId ?? '', seat)) {
        /*
         * Covers three refusals that are one refusal to the person asking: the seat does
         * not exist, it is held back for a wheelchair user or a restricted view, or it
         * belongs to a more expensive tier. Moving into a better tier without paying is
         * the one that matters, and it is why this check is here rather than in the UI.
         */
        return refuse('wrong-tier', `${seat} is not available on your ticket type.`);
      }

      /* Somebody else's live ticket already in that seat. */
      const occupied = await tx.get(
        db
          .collection('tickets')
          .where('eventId', '==', ticket.eventId)
          .where('seat', '==', seat)
          .where('status', 'in', ['valid', 'redeemed'])
          .limit(1)
      );
      if (!occupied.empty && occupied.docs[0].id !== ticketId) {
        return refuse('seat-taken', `${seat} is taken.`);
      }

      /*
       * A checkout holding that seat right now. Claiming it by `create` is what makes two
       * simultaneous moves — or a move racing a purchase — resolve to exactly one winner.
       */
      const lockRef = db.collection(SEAT_LOCKS).doc(seatLockId(ticket.eventId, seat));
      tx.create(lockRef, {
        eventId: ticket.eventId,
        seat,
        holdId: `move:${ticketId}`,
        createdAt: new Date().toISOString(),
      });
      // Released immediately: the ticket below is what makes the seat taken from now on.
      tx.delete(lockRef);

      tx.update(ticketRef, { seat, seatMovedAt: new Date().toISOString() });
      movedContext = { organizerId: String(event.organizerId ?? ''), eventId: ticket.eventId };
      return { ok: true, seat, previousSeat: ticket.seat };
    });

    // docs/25 §76 — after the commit, never inside it: a webhook is a consequence,
    // and a slow endpoint must not hold a Firestore transaction open.
    // TS cannot see the closure assignment, so it narrows the let to null; re-widen.
    const moved = movedContext as { organizerId: string; eventId: string } | null;
    if (outcome.ok && moved && outcome.previousSeat !== outcome.seat) {
      const { queueEvent } = await import('@/backend/services/webhooks');
      await queueEvent(moved.organizerId, 'seat.moved', {
        ticketId,
        eventId: moved.eventId,
        fromSeat: outcome.previousSeat,
        toSeat: outcome.seat,
      }).catch(() => undefined);
    }

    return outcome;
  } catch (error) {
    // ALREADY_EXISTS: a checkout is holding that seat, or another move claimed it first.
    if ((error as { code?: number }).code === 6) {
      return refuse('seat-taken', `${seat} was just taken. Choose another.`);
    }
    reportError(error, { scope: 'seats.move', ticketId, seat });
    return refuse('unavailable', 'That seat change could not be made.');
  }
}

/**
 * Swap two ticket holders' seats.
 *
 * Neither seat is free at any moment, so this cannot be two moves — and as two moves, a
 * failure halfway leaves somebody with no seat at all. One transaction, both writes, or
 * neither.
 *
 * Only the organiser can do this: it changes where somebody *else* is sitting, and an
 * attendee moving a stranger without being asked is not a feature.
 */
export async function exchangeSeats(
  ticketA: string,
  ticketB: string,
  organiserId: string
): Promise<SwapResult> {
  if (!isAdminConfigured()) return refuse('unavailable', 'Seat changes are unavailable.');
  if (ticketA === ticketB) return refuse('no-ticket', 'Choose two different tickets.');

  const db = getAdminDb();

  try {
    return await db.runTransaction<SwapResult>(async (tx) => {
      const refA = db.collection('tickets').doc(ticketA);
      const refB = db.collection('tickets').doc(ticketB);
      const [snapA, snapB] = await Promise.all([tx.get(refA), tx.get(refB)]);

      if (!snapA.exists || !snapB.exists) return refuse('no-ticket', 'One of those tickets is gone.');

      const a = snapA.data() as TicketShape;
      const b = snapB.data() as TicketShape;

      if (a.eventId !== b.eventId) {
        return refuse('no-ticket', 'Those tickets are for different events.');
      }

      const eventSnap = await tx.get(db.collection('events').doc(a.eventId));
      if (eventSnap.data()?.organizerId !== organiserId) {
        return refuse('not-yours', 'That is not your event.');
      }

      if (a.status !== 'valid' || b.status !== 'valid') {
        return refuse('not-live', 'Both tickets must be valid and not yet used.');
      }

      const seatA = (a.seat ?? '').trim().toUpperCase();
      const seatB = (b.seat ?? '').trim().toUpperCase();
      if (!seatA || !seatB) return refuse('seat-taken', 'Both tickets need a seat to swap.');

      /*
       * Each person must be allowed in the seat they are moving into. Two tickets on the
       * same tier always pass; a stalls ticket and a circle ticket do not, and letting
       * them swap would move somebody into a seat they did not pay for — with no payment
       * anywhere to show for it.
       */
      const sections = (eventSnap.data()?.seating ?? []) as SeatingSection[];
      if (sections.length > 0) {
        const aCanSitInB = seatBelongsToTier(sections, a.tierId ?? '', seatB);
        const bCanSitInA = seatBelongsToTier(sections, b.tierId ?? '', seatA);
        if (!aCanSitInB || !bCanSitInA) {
          return refuse('wrong-tier', 'Those seats are on different ticket types.');
        }
      }

      const now = new Date().toISOString();
      tx.update(refA, { seat: seatB, seatMovedAt: now });
      tx.update(refB, { seat: seatA, seatMovedAt: now });

      return { ok: true, seat: seatB, previousSeat: seatA };
    });
  } catch (error) {
    reportError(error, { scope: 'seats.exchange', ticketA, ticketB });
    return refuse('unavailable', 'That swap could not be made.');
  }
}

/* -------------------------------------------------------------------------- */
/* Paid moves across ticket types — theatres' "Not yet", docs/24 §14          */
/* -------------------------------------------------------------------------- */

export type MoveQuote =
  | { ok: true; upgrade: false }
  | {
      ok: true;
      upgrade: true;
      toTierId: string;
      toTierName: string;
      /** What the seat costs over what was paid, major units. Always > 0 here. */
      differenceMajor: number;
    }
  | { ok: false; reason: 'no-ticket' | 'not-yours' | 'not-live' | 'wrong-tier' | 'downgrade' | 'unavailable'; error: string };

/**
 * What moving this ticket to that seat would mean, priced from the stored event.
 *
 * Three answers. Same tier: a free move, exactly as before. A dearer tier: an upgrade,
 * costing the difference between the target tier's price and what this ticket was
 * actually bought for — not the tier's list price twice over, because the buyer already
 * paid once. A cheaper tier stays a refund and a rebooking: paying money back through a
 * seat-change dialog is where "I moved seats" and "where is my refund" become the same
 * support ticket, and the two flows are kept apart on purpose.
 */
export async function quoteMove(ticketId: string, toSeat: string, actorId: string): Promise<MoveQuote> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable', error: 'Seat changes are unavailable.' };

  const seat = toSeat.trim().toUpperCase();
  const db = getAdminDb();

  try {
    const snap = await db.collection('tickets').doc(ticketId).get();
    if (!snap.exists) return { ok: false, reason: 'no-ticket', error: 'That ticket no longer exists.' };
    const ticket = snap.data() as TicketShape & { price?: number };

    if (ticket.userId !== actorId) {
      return { ok: false, reason: 'not-yours', error: 'That ticket is not yours to move.' };
    }
    if (ticket.status !== 'valid') {
      return { ok: false, reason: 'not-live', error: 'That ticket can no longer move.' };
    }

    const eventSnap = await db.collection('events').doc(ticket.eventId).get();
    const event = eventSnap.data() ?? {};
    const sections = (event.seating ?? []) as SeatingSection[];
    const target = sections.find(
      (section) => section.tierId && seatBelongsToTier([section], section.tierId, seat)
    );
    if (!target?.tierId) {
      return { ok: false, reason: 'wrong-tier', error: `${seat} is not a sellable seat.` };
    }

    if (target.tierId === ticket.tierId) return { ok: true, upgrade: false };

    const tiers = (event.ticketTiers ?? []) as Array<{ id: string; name: string; price: number }>;
    const toTier = tiers.find((tier) => tier.id === target.tierId);
    if (!toTier) return { ok: false, reason: 'wrong-tier', error: 'That seat is not on sale.' };

    const difference = Math.round((toTier.price - (ticket.price ?? 0)) * 100) / 100;
    if (difference <= 0) {
      return {
        ok: false,
        reason: 'downgrade',
        error:
          'That seat is on a cheaper ticket type. Moving down is a refund and a new booking — contact the organiser.',
      };
    }

    return { ok: true, upgrade: true, toTierId: toTier.id, toTierName: toTier.name, differenceMajor: difference };
  } catch (error) {
    reportError(error, { scope: 'seats.quote', ticketId, seat });
    return { ok: false, reason: 'unavailable', error: 'Could not price that move.' };
  }
}

/**
 * Land a paid upgrade, exactly once.
 *
 * Runs from the Stripe webhook after the difference was paid. Idempotent by the Stripe
 * event id — `create` on `upgrade_events` refuses a replay before anything else is
 * read — and everything moves in one transaction: the ticket's seat, tier and price;
 * the old tier's `sold` down and the new tier's up, so both inventories stay the
 * numbers the dashboard trusts; the checkout hold consumed and its seat lock released,
 * because the ticket itself is what makes the seat taken from here on.
 *
 * If the seat was somehow lost between payment and here — the hold expired and someone
 * bought it — the money has been taken for a seat that cannot be granted, and that is
 * recorded loudly for the operations queue rather than swallowed: the one outcome this
 * function must never produce is a silent nothing after a successful charge.
 */
export async function applyPaidMove(input: {
  providerEventId: string;
  ticketId: string;
  toSeat: string;
  toTierId: string;
  differenceMajor: number;
  holdId?: string;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'unavailable' };

  const db = getAdminDb();
  const seat = input.toSeat.trim().toUpperCase();
  let upgradeContext: { organizerId: string; eventId: string } | null = null;

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const dedupeRef = db.collection('upgrade_events').doc(input.providerEventId);
      const dedupe = await tx.get(dedupeRef);
      if (dedupe.exists) return { ok: true, duplicate: true };

      const ticketRef = db.collection('tickets').doc(input.ticketId);
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) throw new Error('ticket-missing');
      const ticket = ticketSnap.data() as TicketShape & { price?: number; tierName?: string };

      const eventRef = db.collection('events').doc(ticket.eventId);
      const eventSnap = await tx.get(eventRef);
      const event = eventSnap.data() ?? {};
      const tiers = [...((event.ticketTiers ?? []) as Array<{ id: string; name: string; price: number; sold?: number; held?: number; quantity: number }>)];

      const fromIndex = tiers.findIndex((tier) => tier.id === ticket.tierId);
      const toIndex = tiers.findIndex((tier) => tier.id === input.toTierId);
      if (toIndex < 0) throw new Error('tier-missing');

      /* The seat, still free? The hold's lock should have protected it. */
      const occupied = await tx.get(
        db
          .collection('tickets')
          .where('eventId', '==', ticket.eventId)
          .where('seat', '==', seat)
          .where('status', 'in', ['valid', 'redeemed'])
          .limit(1)
      );
      if (!occupied.empty && occupied.docs[0].id !== input.ticketId) throw new Error('seat-lost');

      if (fromIndex >= 0) {
        tiers[fromIndex] = { ...tiers[fromIndex], sold: Math.max(0, (tiers[fromIndex].sold ?? 0) - 1) };
      }
      tiers[toIndex] = {
        ...tiers[toIndex],
        sold: (tiers[toIndex].sold ?? 0) + 1,
        ...(input.holdId ? { held: Math.max(0, (tiers[toIndex].held ?? 0) - 1) } : {}),
      };
      tx.update(eventRef, { ticketTiers: tiers });

      if (input.holdId) {
        tx.delete(db.collection('checkout_holds').doc(input.holdId));
      }
      // The hold's lock goes; the updated ticket is the seat's owner now.
      tx.delete(db.collection(SEAT_LOCKS).doc(seatLockId(ticket.eventId, seat)));

      tx.update(ticketRef, {
        seat,
        tierId: input.toTierId,
        tierName: tiers[toIndex].name,
        price: Math.round(((ticket.price ?? 0) + input.differenceMajor) * 100) / 100,
        upgradedAt: new Date().toISOString(),
      });

      tx.create(dedupeRef, {
        ticketId: input.ticketId,
        toSeat: seat,
        toTierId: input.toTierId,
        differenceMajor: input.differenceMajor,
        at: new Date().toISOString(),
      });

      upgradeContext = { organizerId: String(event.organizerId ?? ''), eventId: ticket.eventId };
      return { ok: true };
    });

    const upgraded = upgradeContext as { organizerId: string; eventId: string } | null;
    if (outcome.ok && !outcome.duplicate && upgraded) {
      const { queueEvent } = await import('@/backend/services/webhooks');
      await queueEvent(upgraded.organizerId, 'seat.upgraded', {
        ticketId: input.ticketId,
        eventId: upgraded.eventId,
        toSeat: seat,
        toTierId: input.toTierId,
        differenceMajor: input.differenceMajor,
      }).catch(() => undefined);
    }

    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed';
    // Paid money with no seat to grant is a P1 the operations queue must see.
    reportError(error, {
      scope: 'seats.upgrade',
      ticketId: input.ticketId,
      seat,
      providerEventId: input.providerEventId,
      paid: input.differenceMajor,
    });
    return { ok: false, error: message };
  }
}

/*
 * ── Tier upgrades for unseated tickets ──────────────────────────────────────
 *
 * The seated flow above upgrades by choosing a dearer SEAT. A general-admission
 * ticket has no seat to choose, and until now "move my Standard ticket to VIP"
 * was a refund and a rebooking — the last line of the industries page still
 * reading "Not yet". This pair closes it: same money rule (the difference over
 * what was actually paid), same idempotency ledger (`upgrade_events`), same
 * order of operations (money first via Stripe, the move lands in the webhook).
 * Downgrades stay refunds, deliberately — paying money back through an upgrade
 * dialog is where two support queues become one confused one.
 */

export type TierUpgradeQuote =
  | { ok: true; toTierId: string; toTierName: string; differenceMajor: number }
  | {
      ok: false;
      reason: 'no-ticket' | 'not-yours' | 'not-live' | 'wrong-tier' | 'downgrade' | 'sold-out' | 'unavailable';
      error: string;
    };

export async function quoteTierUpgrade(
  ticketId: string,
  toTierId: string,
  actorId: string
): Promise<TierUpgradeQuote> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable', error: 'Upgrades are unavailable.' };
  const db = getAdminDb();

  try {
    const snap = await db.collection('tickets').doc(ticketId).get();
    if (!snap.exists) return { ok: false, reason: 'no-ticket', error: 'That ticket no longer exists.' };
    const ticket = snap.data() as TicketShape & { price?: number; seat?: string };

    if (ticket.userId !== actorId) {
      return { ok: false, reason: 'not-yours', error: 'That ticket is not yours to upgrade.' };
    }
    if (ticket.status !== 'valid') {
      return { ok: false, reason: 'not-live', error: 'That ticket can no longer be upgraded.' };
    }
    if (ticket.seat) {
      // A seated ticket upgrades by choosing a seat in the dearer section — the flow
      // that already exists. Sending it here would move the tier and strand the seat.
      return { ok: false, reason: 'wrong-tier', error: 'Seated tickets upgrade by choosing a new seat.' };
    }

    const event = (await db.collection('events').doc(ticket.eventId).get()).data() ?? {};
    const tiers = (event.ticketTiers ?? []) as TicketTier[];
    const toTier = tiers.find((tier) => tier.id === toTierId);

    if (!toTier || toTier.visibility === 'hidden' || toTier.pricing === 'choose') {
      return { ok: false, reason: 'wrong-tier', error: 'That ticket type is not open to upgrades.' };
    }
    if (toTier.id === ticket.tierId) {
      return { ok: false, reason: 'wrong-tier', error: 'That is already this ticket’s type.' };
    }
    if (!tierSaleWindow(toTier).onSale) {
      return { ok: false, reason: 'wrong-tier', error: 'That ticket type is not on sale.' };
    }
    if (toTier.quantity - (toTier.sold ?? 0) - (toTier.held ?? 0) < 1) {
      return { ok: false, reason: 'sold-out', error: 'That ticket type has sold out.' };
    }

    const difference = Math.round((toTier.price - (ticket.price ?? 0)) * 100) / 100;
    if (difference <= 0) {
      return {
        ok: false,
        reason: 'downgrade',
        error: 'That type costs the same or less. Moving down is a refund and a new booking — contact the organiser.',
      };
    }

    return { ok: true, toTierId: toTier.id, toTierName: toTier.name, differenceMajor: difference };
  } catch (error) {
    reportError(error, { scope: 'tickets.tier-quote', ticketId, toTierId });
    return { ok: false, reason: 'unavailable', error: 'Could not price that upgrade.' };
  }
}

/**
 * Land a paid tier upgrade, exactly once — the seatless sibling of `applyPaidMove`.
 * Same dedupe ledger, same single transaction over ticket + both tier counters + the
 * hold; no seat and no lock, because a GA ticket never owned a chair.
 */
export async function applyPaidTierUpgrade(input: {
  providerEventId: string;
  ticketId: string;
  toTierId: string;
  differenceMajor: number;
  holdId?: string;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'unavailable' };
  const db = getAdminDb();
  let upgradeContext: { organizerId: string; eventId: string; toTierName: string } | null = null;

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const dedupeRef = db.collection('upgrade_events').doc(input.providerEventId);
      const dedupe = await tx.get(dedupeRef);
      if (dedupe.exists) return { ok: true, duplicate: true };

      const ticketRef = db.collection('tickets').doc(input.ticketId);
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) throw new Error('ticket-missing');
      const ticket = ticketSnap.data() as TicketShape & { price?: number };

      const eventRef = db.collection('events').doc(ticket.eventId);
      const eventSnap = await tx.get(eventRef);
      const event = eventSnap.data() ?? {};
      const tiers = [...((event.ticketTiers ?? []) as TicketTier[])];

      const fromIndex = tiers.findIndex((tier) => tier.id === ticket.tierId);
      const toIndex = tiers.findIndex((tier) => tier.id === input.toTierId);
      if (toIndex < 0) throw new Error('tier-missing');

      if (fromIndex >= 0) {
        tiers[fromIndex] = { ...tiers[fromIndex], sold: Math.max(0, (tiers[fromIndex].sold ?? 0) - 1) };
      }
      tiers[toIndex] = {
        ...tiers[toIndex],
        sold: (tiers[toIndex].sold ?? 0) + 1,
        ...(input.holdId ? { held: Math.max(0, (tiers[toIndex].held ?? 0) - 1) } : {}),
      };
      tx.update(eventRef, { ticketTiers: tiers });

      if (input.holdId) tx.delete(db.collection('checkout_holds').doc(input.holdId));

      tx.update(ticketRef, {
        tierId: input.toTierId,
        tierName: tiers[toIndex].name,
        price: Math.round(((ticket.price ?? 0) + input.differenceMajor) * 100) / 100,
        upgradedAt: new Date().toISOString(),
      });

      tx.create(dedupeRef, {
        ticketId: input.ticketId,
        toTierId: input.toTierId,
        differenceMajor: input.differenceMajor,
        at: new Date().toISOString(),
      });

      upgradeContext = {
        organizerId: String(event.organizerId ?? ''),
        eventId: ticket.eventId,
        toTierName: tiers[toIndex].name,
      };
      return { ok: true };
    });

    // Widened out of the transaction callback — TS narrows the capture to null.
    const upgraded = upgradeContext as { organizerId: string; eventId: string; toTierName: string } | null;
    if (outcome.ok && !outcome.duplicate && upgraded) {
      const { queueEvent } = await import('@/backend/services/webhooks');
      await queueEvent(upgraded.organizerId, 'ticket.upgraded', {
        ticketId: input.ticketId,
        eventId: upgraded.eventId,
        toTierId: input.toTierId,
        toTierName: upgraded.toTierName,
        differenceMajor: input.differenceMajor,
      }).catch(() => undefined);
    }

    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed';
    // Money was taken; the move must never silently not happen.
    reportError(error, {
      scope: 'tickets.tier-upgrade',
      ticketId: input.ticketId,
      toTierId: input.toTierId,
      providerEventId: input.providerEventId,
      paid: input.differenceMajor,
    });
    return { ok: false, error: message };
  }
}
