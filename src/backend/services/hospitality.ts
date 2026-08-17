import 'server-only';

import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { HOLD_WINDOW_MS, placeHold, releaseHold } from '@/backend/services/holds';
import { computeOrderFees, toMinor } from '@/shared/fees';
import type {
  HospitalityBooking,
  HospitalityGuest,
  HospitalityPackage,
  TicketTier,
} from '@/shared/types';

/**
 * Hospitality — tables sold as inventory, with deposits and named guests.
 *
 * ## One money path, still
 *
 * A deposit is a **partial payment against one total**, not a second price. The total
 * comes from the same `computeOrderFees` every ticket goes through, so commission, the
 * buyer service fee, VAT and the organiser's 100% payout are unchanged and there is no
 * second way to charge. A booking records what is owed and what has arrived; the
 * charging itself is the checkout that already exists.
 *
 * ## Tickets issue on settlement, never on deposit
 *
 * A deposit reserves the table. It does not admit anybody. Issuing on deposit would put
 * guests in the room holding tickets for money the organiser has not received, and
 * chasing a balance from someone already seated is not a position to design into a
 * product.
 *
 * ## The table is reserved with the same hold mechanism
 *
 * A booked-but-unpaid table must not be sellable to somebody else, and that is exactly
 * what `placeHold` already does — atomically, tested, and floored at zero. Reusing it
 * means hospitality inventory cannot drift away from ticket inventory, because they are
 * the same counter.
 */

export type BookingResult =
  | { ok: true; bookingId: string; depositMinor: number; totalMinor: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 503; error: string };

/**
 * What issuance needs when a booking settles.
 *
 * Returned rather than acted on, because this module must not become a second way to
 * issue tickets. The caller records one `payment_events` document and the function that
 * has always issued tickets does it — with the same transaction, the same oversell
 * guard, and the same hold consumption.
 */
export interface SettledBooking {
  eventId: string;
  tierId: string;
  buyerUserId: string;
  buyerEmail: string;
  covers: number;
  unitFaceMinor: number;
  currency: string;
  holdId?: string;
}

export type PaymentResult =
  | {
      ok: true;
      status: HospitalityBooking['status'];
      outstandingMinor: number;
      /** Present only on the payment that settled the balance. */
      settled?: SettledBooking;
    }
  | { ok: false; status: 400 | 404 | 409 | 503; error: string };

function findPackage(
  event: { hospitality?: HospitalityPackage[]; ticketTiers?: TicketTier[] },
  packageId: string
): { pkg: HospitalityPackage; tier: TicketTier } | null {
  const pkg = event.hospitality?.find((p) => p.id === packageId);
  if (!pkg) return null;
  const tier = event.ticketTiers?.find((t) => t.id === pkg.tierId);
  if (!tier) return null;
  return { pkg, tier };
}

/**
 * Reserve a table.
 *
 * The covers are held against the tier immediately, so the table stops being sellable
 * before the buyer has paid anything. If the payment never arrives, the hold sweep
 * returns it — the same mechanism that recovers an abandoned ticket checkout.
 */
export async function bookTable(
  eventId: string,
  packageId: string,
  buyerUserId: string,
  buyerEmail: string
): Promise<BookingResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Bookings are unavailable.' };

  const db = getAdminDb();

  try {
    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) return { ok: false, status: 404, error: 'That event no longer exists.' };

    const event = eventSnap.data() as {
      hospitality?: HospitalityPackage[];
      ticketTiers?: TicketTier[];
      date?: string;
      title?: string;
      currency?: string;
    };

    const found = findPackage(event, packageId);
    if (!found) return { ok: false, status: 404, error: 'That package is no longer offered.' };

    const { pkg, tier } = found;

    if (event.date && new Date(event.date).getTime() < Date.now()) {
      return { ok: false, status: 409, error: 'That event has already taken place.' };
    }

    /*
     * The table is `covers` seats of the tier. Held before any money is discussed, so a
     * second buyer is told it is gone rather than paying a deposit on the same table.
     *
     * The window runs to the balance due date, not the fifteen minutes a card takes. A
     * table reserved on a deposit and then released by the checkout sweep would be resold
     * underneath somebody who has already paid a quarter of it. When the balance never
     * arrives the sweep does release it — which is the correct outcome, and the reason
     * `expireLapsedBookings` exists to mark the booking to match.
     */
    const deadline = pkg.balanceDueDate ? new Date(pkg.balanceDueDate).getTime() : undefined;
    const eventStart = event.date ? new Date(event.date).getTime() : undefined;
    const holdUntil = Math.min(
      deadline && deadline > Date.now() ? deadline : Number.POSITIVE_INFINITY,
      eventStart && eventStart > Date.now() ? eventStart : Number.POSITIVE_INFINITY
    );
    const ttlMs = Number.isFinite(holdUntil) ? holdUntil - Date.now() : HOLD_WINDOW_MS;

    const hold = await placeHold(eventId, pkg.tierId, pkg.covers, ttlMs);
    if (!hold.ok) return { ok: false, status: 409, error: hold.error };

    /*
     * The total, from the one engine.
     *
     * Priced as `covers` tickets at the tier price rather than as a single line, because
     * the buyer-side service fee is per paid ticket — pricing a ten-cover table as one
     * ticket would undercharge the fee by nine.
     */
    const quote = computeOrderFees([{ faceMinor: toMinor(tier.price), qty: pkg.covers }]);

    const depositPercent = Math.min(100, Math.max(1, pkg.depositPercent || 100));
    const depositMinor =
      depositPercent >= 100
        ? quote.buyerTotalMinor
        : Math.round((quote.buyerTotalMinor * depositPercent) / 100);

    const ref = await db.collection('hospitality_bookings').add({
      eventId,
      packageId,
      tierId: pkg.tierId,
      buyerUserId,
      buyerEmail,
      covers: pkg.covers,
      totalMinor: quote.buyerTotalMinor,
      depositMinor,
      paidMinor: 0,
      status: 'deposit_pending',
      guests: [],
      holdId: hold.holdId,
      // Kept on the booking so settlement issues tickets at the price the table was
      // sold at, not at whatever the tier costs weeks later.
      unitFaceMinor: toMinor(tier.price),
      currency: event.currency ?? 'GBP',
      packageName: pkg.name,
      eventTitle: event.title ?? '',
      ...(pkg.balanceDueDate ? { balanceDueDate: pkg.balanceDueDate } : {}),
      createdAt: new Date().toISOString(),
    });

    await dispatch({
      eventKey: 'hospitality.table.reserved',
      recipient: { email: buyerEmail, userId: buyerUserId },
      vars: { event: event.title ?? 'your event' },
      body: [
        `Your ${pkg.name} table for ${pkg.covers} at ${event.title ?? 'the event'} is reserved.`,
        depositPercent >= 100
          ? 'Once payment clears, your tickets are issued and the guest list opens.'
          : `A deposit is due now. Tickets are issued when the balance is settled${pkg.balanceDueDate ? ` — due ${new Date(pkg.balanceDueDate).toLocaleDateString('en-GB')}` : ''}.`,
      ],
    }).catch(() => undefined);

    return { ok: true, bookingId: ref.id, depositMinor, totalMinor: quote.buyerTotalMinor };
  } catch (error) {
    reportError(error, { scope: 'hospitality.book', eventId, packageId });
    return { ok: false, status: 503, error: 'Could not reserve that table.' };
  }
}

/**
 * Record money arriving against a booking.
 *
 * Additive and idempotent by payment reference: a replayed webhook must not credit the
 * same deposit twice and mark a table settled that is still half paid. The amount is
 * never taken from a browser — this is called from the payment path, with a figure the
 * provider confirmed.
 */
export async function recordBookingPayment(
  bookingId: string,
  amountMinor: number,
  paymentRef: string
): Promise<PaymentResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Bookings are unavailable.' };
  if (amountMinor <= 0) return { ok: false, status: 400, error: 'Nothing to record.' };

  const db = getAdminDb();
  const ref = db.collection('hospitality_bookings').doc(bookingId);

  try {
    const result = await db.runTransaction<PaymentResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, status: 404, error: 'No such booking.' };

      const booking = snap.data() as HospitalityBooking & {
        payments?: string[];
        holdId?: string;
        unitFaceMinor?: number;
        currency?: string;
      };

      if (booking.status === 'cancelled') {
        return { ok: false, status: 409, error: 'That booking was cancelled.' };
      }

      // Idempotency by reference, the same discipline as `payment_events`.
      if ((booking.payments ?? []).includes(paymentRef)) {
        return {
          ok: true,
          status: booking.status,
          outstandingMinor: Math.max(0, booking.totalMinor - booking.paidMinor),
        };
      }

      const paidMinor = booking.paidMinor + amountMinor;
      const outstandingMinor = Math.max(0, booking.totalMinor - paidMinor);
      const status: HospitalityBooking['status'] =
        outstandingMinor === 0 ? 'paid' : 'deposit_paid';

      tx.update(ref, {
        paidMinor,
        status,
        payments: [...(booking.payments ?? []), paymentRef],
        ...(status === 'paid' ? { settledAt: new Date().toISOString() } : {}),
      });

      return {
        ok: true,
        status,
        outstandingMinor,
        // Only on the payment that closed the balance. A deposit returns nothing here,
        // which is what keeps tickets from being issued against money not yet received.
        ...(status === 'paid'
          ? {
              settled: {
                eventId: booking.eventId,
                tierId: booking.tierId,
                buyerUserId: booking.buyerUserId,
                buyerEmail: booking.buyerEmail,
                covers: booking.covers,
                unitFaceMinor: booking.unitFaceMinor ?? 0,
                currency: booking.currency ?? 'GBP',
                holdId: booking.holdId,
              } satisfies SettledBooking,
            }
          : {}),
      };
    });

    /* Told after the transaction commits, never inside it: a transaction can be retried
       by the driver, and an email sent from inside one is sent again on every retry. */
    if (result.ok && result.settled) {
      await dispatch({
        eventKey: 'hospitality.booking.settled',
        recipient: { email: result.settled.buyerEmail, userId: result.settled.buyerUserId },
        vars: { event: result.settled.eventId },
        body: [
          'Your table is paid in full.',
          `${result.settled.covers} tickets are on their way to this address, and your guest list is open until the doors.`,
        ],
      }).catch(() => undefined);
    } else if (result.ok && result.status === 'deposit_paid') {
      await dispatch({
        eventKey: 'hospitality.balance.due',
        recipient: { email: (await ref.get()).data()?.buyerEmail ?? '' },
        vars: { amount: (result.outstandingMinor / 100).toFixed(2) },
        body: [
          `Your deposit has been received. £${(result.outstandingMinor / 100).toFixed(2)} remains outstanding.`,
          'Tickets are issued once the balance is settled — you can pay it from your bookings at any time.',
        ],
      }).catch(() => undefined);
    }

    return result;
  } catch (error) {
    reportError(error, { scope: 'hospitality.payment', bookingId });
    return { ok: false, status: 503, error: 'Could not record that payment.' };
  }
}

/**
 * Name the guests.
 *
 * Capped at the table's covers: a ten-cover table with fourteen names is either a
 * mistake or an attempt to get four people in free, and both are better refused here
 * than discovered at the door.
 */
export async function setGuests(
  bookingId: string,
  byUserId: string,
  guests: HospitalityGuest[]
): Promise<{ ok: true; count: number } | { ok: false; status: 400 | 403 | 404 | 503; error: string }> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Bookings are unavailable.' };

  const db = getAdminDb();
  const ref = db.collection('hospitality_bookings').doc(bookingId);

  try {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, status: 404, error: 'No such booking.' };

    const booking = snap.data() as HospitalityBooking;
    if (booking.buyerUserId !== byUserId) {
      return { ok: false, status: 403, error: 'That is not your booking.' };
    }
    if (guests.length > booking.covers) {
      return {
        ok: false,
        status: 400,
        error: `That table seats ${booking.covers}. You have named ${guests.length}.`,
      };
    }

    const cleaned = guests
      .filter((g) => g.name?.trim())
      .map((g) => ({
        name: g.name.trim().slice(0, 120),
        ...(g.email?.trim() ? { email: g.email.trim().toLowerCase() } : {}),
        ...(g.dietary?.trim() ? { dietary: g.dietary.trim().slice(0, 200) } : {}),
        ...(g.accessibility?.trim() ? { accessibility: g.accessibility.trim().slice(0, 200) } : {}),
      }));

    await ref.update({ guests: cleaned });
    return { ok: true, count: cleaned.length };
  } catch (error) {
    reportError(error, { scope: 'hospitality.guests', bookingId });
    return { ok: false, status: 503, error: 'Could not save that guest list.' };
  }
}

/**
 * Cancel, returning the table to sale.
 *
 * Deliberately does not refund. Money already taken is reversed through the refund path
 * that exists, with its own idempotency and its own audit — a cancel button that quietly
 * moved money would be a second refund mechanism, and the platform has one.
 */
export async function cancelBooking(
  bookingId: string,
  byUserId: string,
  isOrganiser = false
): Promise<{ ok: boolean; refundOwedMinor: number }> {
  if (!isAdminConfigured()) return { ok: false, refundOwedMinor: 0 };

  const db = getAdminDb();
  const ref = db.collection('hospitality_bookings').doc(bookingId);

  try {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, refundOwedMinor: 0 };

    const booking = snap.data() as HospitalityBooking & { holdId?: string };
    if (!isOrganiser && booking.buyerUserId !== byUserId) return { ok: false, refundOwedMinor: 0 };
    if (booking.status === 'cancelled') return { ok: false, refundOwedMinor: 0 };

    if (booking.holdId) await releaseHold(booking.holdId, 'abandoned');

    await ref.update({ status: 'cancelled', cancelledAt: new Date().toISOString() });

    if (booking.buyerEmail) {
      await dispatch({
        eventKey: 'hospitality.booking.cancelled',
        recipient: { email: booking.buyerEmail, userId: booking.buyerUserId },
        vars: { event: booking.eventId },
        body: [
          'Your table booking has been cancelled and the table is back on sale.',
          booking.paidMinor > 0
            ? 'Anything already paid is refunded separately — you will get a confirmation when it is processed.'
            : 'Nothing had been paid, so there is nothing to refund.',
        ],
      }).catch(() => undefined);
    }

    // What is owed, stated. The refund itself runs through the existing path.
    return { ok: true, refundOwedMinor: booking.paidMinor };
  } catch (error) {
    reportError(error, { scope: 'hospitality.cancel', bookingId });
    return { ok: false, refundOwedMinor: 0 };
  }
}

/** One booking, or nothing. Used by the pay route and the buyer's booking page. */
export async function getBooking(bookingId: string): Promise<(HospitalityBooking & { holdId?: string; eventTitle?: string; packageName?: string; currency?: string }) | null> {
  if (!isAdminConfigured()) return null;
  try {
    const snap = await getAdminDb().collection('hospitality_bookings').doc(bookingId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as object) } as HospitalityBooking;
  } catch (error) {
    reportError(error, { scope: 'hospitality.get', bookingId });
    return null;
  }
}

/**
 * What the buyer owes right now.
 *
 * The deposit until it has been paid, then whatever is left. Computed here rather than
 * in the route so a browser cannot name the amount it would like to pay.
 */
export function amountDueMinor(booking: Pick<HospitalityBooking, 'status' | 'depositMinor' | 'paidMinor' | 'totalMinor'>): number {
  if (booking.status === 'cancelled' || booking.status === 'expired') return 0;
  if (booking.paidMinor <= 0) return booking.depositMinor;
  return Math.max(0, booking.totalMinor - booking.paidMinor);
}

/** A buyer's own bookings, newest first. */
export async function bookingsForUser(userId: string): Promise<HospitalityBooking[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection('hospitality_bookings')
      .where('buyerUserId', '==', userId)
      .limit(100)
      .get();

    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) }) as HospitalityBooking)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'hospitality.forUser', userId });
    return [];
  }
}

/** Every booking on one event — the organiser's table plan. */
export async function bookingsForEvent(eventId: string): Promise<HospitalityBooking[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection('hospitality_bookings')
      .where('eventId', '==', eventId)
      .limit(500)
      .get();

    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) }) as HospitalityBooking)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'hospitality.forEvent', eventId });
    return [];
  }
}

/**
 * Mark bookings whose table has already gone back on sale.
 *
 * The hold sweep is the authority on inventory: when a balance is never paid, it takes
 * the covers back on the due date and the table is sellable again. That leaves a booking
 * document claiming a table it no longer holds, which is exactly the kind of quiet
 * disagreement that turns into two parties at one table. This closes it, in the same
 * cron pass that runs the sweep.
 *
 * Deliberately does not refund the deposit — money moves through the refund path that
 * exists, with its own audit.
 */
export async function expireLapsedBookings(limit = 200): Promise<number> {
  if (!isAdminConfigured()) return 0;

  const db = getAdminDb();
  try {
    const open = await db
      .collection('hospitality_bookings')
      .where('status', 'in', ['deposit_pending', 'deposit_paid'])
      .limit(limit)
      .get();

    let expired = 0;
    for (const doc of open.docs) {
      const booking = doc.data() as HospitalityBooking & { holdId?: string };
      if (!booking.holdId) continue;

      const hold = await db.collection('checkout_holds').doc(booking.holdId).get();
      // Still reserved: nothing to do. The table is the buyer's until it is not.
      if (hold.exists && !hold.data()?.releasedAt) continue;

      await doc.ref.update({ status: 'expired', expiredAt: new Date().toISOString() });
      expired += 1;

      if (booking.buyerEmail) {
        await dispatch({
          eventKey: 'hospitality.booking.cancelled',
          recipient: { email: booking.buyerEmail, userId: booking.buyerUserId },
          vars: { event: booking.eventId },
          body: [
            'Your table booking has lapsed and the table has gone back on sale.',
            booking.paidMinor > 0
              ? 'Anything already paid is handled separately — the organiser will be in touch.'
              : 'Nothing had been paid, so there is nothing to refund.',
          ],
        }).catch(() => undefined);
      }
    }
    return expired;
  } catch (error) {
    reportError(error, { scope: 'hospitality.expire' });
    return 0;
  }
}

/** Bookings an organiser needs to chase, and the money outstanding. */
export async function outstandingBookings(eventId: string): Promise<
  Array<{ id: string; buyerEmail: string; covers: number; outstandingMinor: number; dueDate?: string }>
> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection('hospitality_bookings')
      .where('eventId', '==', eventId)
      .where('status', '==', 'deposit_paid')
      .limit(200)
      .get();

    return snap.docs.map((doc) => {
      const b = doc.data() as HospitalityBooking;
      return {
        id: doc.id,
        buyerEmail: b.buyerEmail,
        covers: b.covers,
        outstandingMinor: Math.max(0, b.totalMinor - b.paidMinor),
        dueDate: b.balanceDueDate,
      };
    });
  } catch (error) {
    reportError(error, { scope: 'hospitality.outstanding', eventId });
    return [];
  }
}
