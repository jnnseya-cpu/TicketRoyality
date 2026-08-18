import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { dispatch } from '@/backend/comms/dispatch';
import { moveSeat } from '@/backend/services/seat-swap';
import { takenSeats } from '@/backend/services/seats';
import { sectionSeats } from '@/shared/seating';
import type { SeatingSection } from '@/shared/types';

/**
 * Production kills — docs/25 §43, docs/24 §27, and the concert reality behind both:
 * the rig arrives, the sound desk lands where row Q was, and eighty seats stop
 * existing a week after some of them were sold.
 *
 * ## The one rule
 *
 * **Never silently invalidate a sold seat.** Unsold seats block instantly — that is
 * inventory management. A sold seat becomes a *reseating case*: a record that a named
 * ticket holder needs a new seat, worked through the same `moveSeat` the box office
 * already uses, with the holder told by email when it happens. The ticket itself stays
 * valid throughout — the person's entry must never depend on how quickly the organiser
 * clears a queue.
 *
 * ## Why seats block on the section, not in a new collection
 *
 * `unavailableSeats` already exists, already refuses sale server-side at hold time, and
 * already renders held-back on every map. A parallel "killed" store would be a second
 * source of truth for the same fact (CLAUDE.md §3); the case list carries the *reason*
 * and the workflow, the section carries the block.
 */

const CASES = 'reseat_cases';

export interface KillSummary {
  blocked: string[];
  cases: Array<{ caseId: string; seat: string; attendeeName: string }>;
  alreadyInside: string[];
  unknown: string[];
}

export async function killSeats(
  eventId: string,
  organizerId: string,
  seats: string[],
  reason: string
): Promise<{ ok: true; summary: KillSummary } | { ok: false; status: 403 | 404 | 503; error: string }> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Unavailable.' };

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);

  try {
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) return { ok: false, status: 404, error: 'No such event.' };
    const event = eventSnap.data() ?? {};
    if (event.organizerId !== organizerId) {
      return { ok: false, status: 403, error: 'Not your event.' };
    }

    const sections = (event.seating ?? []) as SeatingSection[];
    const known = new Set(
      sections.flatMap((section) => sectionSeats(section).map((seat) => seat.label))
    );

    const wanted = [...new Set(seats.map((seat) => seat.trim().toUpperCase()).filter(Boolean))];
    const unknown = wanted.filter((seat) => !known.has(seat));
    const real = wanted.filter((seat) => known.has(seat));

    /* Who is sitting there. Chunked: `in` takes 30 values at most. */
    const soldBySeat = new Map<string, { ticketId: string; attendeeName: string; status: string }>();
    for (let i = 0; i < real.length; i += 30) {
      const chunk = real.slice(i, i + 30);
      const snap = await db
        .collection('tickets')
        .where('eventId', '==', eventId)
        .where('seat', 'in', chunk)
        .get();
      for (const doc of snap.docs) {
        const ticket = doc.data() as { seat?: string; status?: string; attendeeName?: string };
        if (ticket.status === 'valid' || ticket.status === 'redeemed') {
          soldBySeat.set(String(ticket.seat), {
            ticketId: doc.id,
            attendeeName: ticket.attendeeName ?? 'Ticket holder',
            status: String(ticket.status),
          });
        }
      }
    }

    const summary: KillSummary = { blocked: [], cases: [], alreadyInside: [], unknown };

    /*
     * The block, transactionally on the event document: every killed seat — sold or
     * not — leaves sale immediately, so nothing new is sold into the rig while the
     * cases are being worked.
     */
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(eventRef);
      const freshSections = [...((fresh.data()?.seating ?? []) as SeatingSection[])];
      for (let i = 0; i < freshSections.length; i += 1) {
        const section = freshSections[i];
        const inSection = new Set(sectionSeats(section).map((seat) => seat.label));
        const additions = real.filter((seat) => inSection.has(seat));
        if (additions.length === 0) continue;
        freshSections[i] = {
          ...section,
          unavailableSeats: [
            ...new Set([...(section.unavailableSeats ?? []), ...additions]),
          ],
        };
      }
      tx.update(eventRef, { seating: freshSections });
    });

    for (const seat of real) {
      const sold = soldBySeat.get(seat);
      if (!sold) {
        summary.blocked.push(seat);
        continue;
      }
      if (sold.status === 'redeemed') {
        // Already inside the building; reseating them is a steward's conversation,
        // not a database write.
        summary.alreadyInside.push(seat);
        continue;
      }

      // One open case per ticket, idempotent by id: killing an area twice while the
      // first pass is half-worked must not double the queue.
      const caseId = `${eventId}__${sold.ticketId}`;
      await db
        .collection(CASES)
        .doc(caseId)
        .set(
          {
            eventId,
            organizerId,
            ticketId: sold.ticketId,
            seat,
            attendeeName: sold.attendeeName,
            reason,
            status: 'open',
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      summary.cases.push({ caseId, seat, attendeeName: sold.attendeeName });
    }

    return { ok: true, summary };
  } catch (error) {
    reportError(error, { scope: 'production-kill', eventId });
    return { ok: false, status: 503, error: 'The kill could not be applied.' };
  }
}

export interface ReseatCase {
  caseId: string;
  ticketId: string;
  seat: string;
  attendeeName: string;
  reason: string;
  status: string;
  /** A free seat on the same tier, computed fresh on every read. Empty when none left. */
  suggestedSeat?: string;
}

/** Open cases with a live suggestion each — docs/25 §44's queue, on the existing model. */
export async function openCases(eventId: string, organizerId: string): Promise<ReseatCase[]> {
  if (!isAdminConfigured()) return [];
  const db = getAdminDb();

  try {
    const [caseSnap, eventSnap, taken] = await Promise.all([
      db
        .collection(CASES)
        .where('eventId', '==', eventId)
        .where('status', '==', 'open')
        .limit(100)
        .get(),
      db.collection('events').doc(eventId).get(),
      takenSeats(eventId),
    ]);
    if (eventSnap.data()?.organizerId !== organizerId) return [];

    const sections = (eventSnap.data()?.seating ?? []) as SeatingSection[];
    const takenSet = new Set(taken);
    const suggested = new Set<string>();

    const ticketIds = caseSnap.docs.map((d) => String(d.data().ticketId));
    const tierByTicket = new Map<string, string>();
    for (let i = 0; i < ticketIds.length; i += 30) {
      const chunk = ticketIds.slice(i, i + 30);
      const snap = await db.collection('tickets').where('__name__', 'in', chunk).get();
      for (const doc of snap.docs) tierByTicket.set(doc.id, String(doc.data().tierId ?? ''));
    }

    return caseSnap.docs.map((doc) => {
      const data = doc.data() as Omit<ReseatCase, 'caseId' | 'suggestedSeat'>;
      const tierId = tierByTicket.get(data.ticketId) ?? '';

      const free = sections
        .filter((section) => section.tierId === tierId)
        .flatMap((section) => {
          const out = new Set([
            ...(section.unavailableSeats ?? []),
            ...(section.accessibleSeats ?? []),
          ]);
          return sectionSeats(section)
            .map((seat) => seat.label)
            .filter((label) => !out.has(label) && !takenSet.has(label) && !suggested.has(label));
        });

      // Each case gets a distinct suggestion, or applying them top-to-bottom would
      // send the whole queue to the same chair.
      const suggestion = free[0];
      if (suggestion) suggested.add(suggestion);

      return { caseId: doc.id, ...data, ...(suggestion ? { suggestedSeat: suggestion } : {}) };
    });
  } catch (error) {
    reportError(error, { scope: 'production-kill.cases', eventId });
    return [];
  }
}

/**
 * Resolve one case: the same box-office move every other reseat uses, then the holder
 * is told. The email is a courtesy on top of the move, never a reason to fail it.
 */
export async function resolveCase(
  caseId: string,
  organizerId: string,
  toSeat: string
): Promise<{ ok: true; seat: string } | { ok: false; status: 403 | 404 | 409 | 503; error: string }> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Unavailable.' };
  const db = getAdminDb();

  try {
    const snap = await db.collection(CASES).doc(caseId).get();
    if (!snap.exists) return { ok: false, status: 404, error: 'No such case.' };
    const data = snap.data() as {
      organizerId: string;
      ticketId: string;
      status: string;
      reason: string;
      seat: string;
    };
    if (data.organizerId !== organizerId) return { ok: false, status: 403, error: 'Not your event.' };
    if (data.status !== 'open') return { ok: false, status: 409, error: 'Already resolved.' };

    const moved = await moveSeat(data.ticketId, toSeat, organizerId);
    if (!moved.ok) {
      return { ok: false, status: 409, error: moved.error };
    }

    await snap.ref.update({
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      newSeat: moved.seat,
    });

    const ticket = (await db.collection('tickets').doc(data.ticketId).get()).data() as
      | { attendeeEmail?: string; attendeeName?: string; eventTitle?: string; userId?: string }
      | undefined;
    if (ticket?.attendeeEmail) {
      await dispatch({
        eventKey: 'ticket.reseated',
        recipient: { email: ticket.attendeeEmail, userId: ticket.userId },
        vars: { event: ticket.eventTitle ?? 'your event', seat: moved.seat },
        body: [
          `Your seat for ${ticket.eventTitle ?? 'your event'} has changed: you are now in ${moved.seat}.`,
          `The area around your original seat (${data.seat}) is out of use for this performance — ${data.reason}.`,
          'Your ticket and its code are unchanged; only the seat printed on it has moved.',
        ],
      }).catch(() => undefined);
    }

    return { ok: true, seat: moved.seat };
  } catch (error) {
    reportError(error, { scope: 'production-kill.resolve', caseId });
    return { ok: false, status: 503, error: 'Could not resolve the case.' };
  }
}
