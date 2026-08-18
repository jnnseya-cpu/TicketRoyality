import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { EventSession } from '@/shared/types';

/**
 * Registering for sessions inside an event.
 *
 * ## The place is reserved, not the ticket consumed
 *
 * Registration never touches ticket `status`. A conference pass is used at the front
 * door once; booking a workshop is a different question asked weeks earlier, and reusing
 * `redeemed` for it would mean a ticket that admits nobody after its first workshop.
 *
 * ## Capacity is transactional, because that is the entire point
 *
 * A workshop that holds thirty inside a conference that sold nine hundred will be
 * oversubscribed within minutes of the agenda going out. A read-then-write would let two
 * hundred people all see "one place left" and all take it.
 *
 * ## Clashes are refused
 *
 * Two sessions at the same time is not a preference to record, it is a mistake to catch:
 * the attendee cannot attend both, and the second workshop has now lost a place to
 * somebody who will not turn up. Refusing it is what keeps the capacity number honest —
 * and the honesty of that number is why the organiser trusts it enough to order chairs.
 */

const REGISTRATIONS = 'session_registrations';

/** One document per ticket per session, so registering twice is refused by construction. */
function registrationId(ticketId: string, sessionId: string): string {
  return `${ticketId}__${sessionId}`;
}

export type RegisterResult =
  | { ok: true; sessionTitle: string; registered: number; capacity: number | null }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409 | 503;
      kind:
        | 'no-event'
        | 'no-session'
        | 'no-ticket'
        | 'wrong-tier'
        | 'full'
        | 'already'
        | 'clash'
        | 'unavailable';
      error: string;
    };

function overlaps(a: EventSession, b: EventSession): boolean {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  if ([aStart, aEnd, bStart, bEnd].some((t) => Number.isNaN(t))) return false;
  // Touching at the boundary is not a clash: a session ending at 3 and one starting at 3
  // is a normal agenda, and refusing it would make a full day unbookable.
  return aStart < bEnd && bStart < aEnd;
}

export async function registerForSession(
  eventId: string,
  sessionId: string,
  ticketId: string,
  userId: string
): Promise<RegisterResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, kind: 'unavailable', error: 'Sessions are unavailable.' };
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const ticketRef = db.collection('tickets').doc(ticketId);
  const regRef = db.collection(REGISTRATIONS).doc(registrationId(ticketId, sessionId));

  try {
    return await db.runTransaction<RegisterResult>(async (tx) => {
      const [eventSnap, ticketSnap, regSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(ticketRef),
        tx.get(regRef),
      ]);

      if (!eventSnap.exists) {
        return { ok: false, status: 404, kind: 'no-event', error: 'That event no longer exists.' };
      }
      if (!ticketSnap.exists) {
        return { ok: false, status: 404, kind: 'no-ticket', error: 'No such ticket.' };
      }
      if (regSnap.exists) {
        return { ok: false, status: 409, kind: 'already', error: 'You already have a place.' };
      }

      const sessions = (eventSnap.data()?.sessions ?? []) as EventSession[];
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index < 0) {
        return { ok: false, status: 404, kind: 'no-session', error: 'That session is not on this event.' };
      }

      const session = sessions[index];
      const ticket = ticketSnap.data() as {
        userId: string;
        eventId: string;
        tierId?: string;
        status: string;
      };

      // Ownership from the document. A route that took a userId on trust would let
      // anybody fill a workshop with other people's tickets.
      if (ticket.userId !== userId) {
        return { ok: false, status: 403, kind: 'no-ticket', error: 'That is not your ticket.' };
      }
      if (ticket.eventId !== eventId) {
        return { ok: false, status: 409, kind: 'no-ticket', error: 'That ticket is for a different event.' };
      }
      if (ticket.status !== 'valid' && ticket.status !== 'redeemed') {
        return { ok: false, status: 409, kind: 'no-ticket', error: `That ticket is ${ticket.status}.` };
      }

      if (session.allowedTierIds.length > 0 && !session.allowedTierIds.includes(ticket.tierId ?? '')) {
        return {
          ok: false,
          status: 403,
          kind: 'wrong-tier',
          error: `${session.title} is not included with your ticket.`,
        };
      }

      const registered = session.registered ?? 0;
      if (session.capacity !== null && registered >= session.capacity) {
        return {
          ok: false,
          status: 409,
          kind: 'full',
          error: `${session.title} is full.`,
        };
      }

      /*
       * A clash with something already booked on this ticket.
       *
       * Read inside the transaction against the same event document, so two overlapping
       * registrations submitted at once cannot both pass a check the other invalidates.
       */
      const existing = await tx.get(
        db.collection(REGISTRATIONS).where('ticketId', '==', ticketId).limit(50)
      );
      const bookedIds = existing.docs.map((d) => (d.data() as { sessionId: string }).sessionId);
      const clash = sessions.find((s) => bookedIds.includes(s.id) && overlaps(s, session));
      if (clash) {
        return {
          ok: false,
          status: 409,
          kind: 'clash',
          error: `That runs at the same time as ${clash.title}.`,
        };
      }

      // Only a capped session counts: an uncapped keynote has nothing to reserve, and
      // incrementing a number nobody bounds is a number nobody can use.
      if (session.capacity !== null) {
        const next = [...sessions];
        next[index] = { ...session, registered: registered + 1 };
        tx.update(eventRef, { sessions: next });
      }

      tx.set(regRef, {
        ticketId,
        sessionId,
        eventId,
        userId,
        title: session.title,
        start: session.start,
        end: session.end,
        createdAt: new Date().toISOString(),
      });

      return {
        ok: true,
        sessionTitle: session.title,
        registered: session.capacity === null ? registered : registered + 1,
        capacity: session.capacity,
      };
    });
  } catch (error) {
    reportError(error, { scope: 'sessions.register', eventId, sessionId, ticketId });
    return { ok: false, status: 503, kind: 'unavailable', error: 'Could not reserve that place.' };
  }
}

/** Giving the place back, which someone else can then take. */
export async function cancelSessionRegistration(
  eventId: string,
  sessionId: string,
  ticketId: string,
  userId: string
): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const regRef = db.collection(REGISTRATIONS).doc(registrationId(ticketId, sessionId));

  try {
    return await db.runTransaction<boolean>(async (tx) => {
      const [regSnap, eventSnap] = await Promise.all([tx.get(regRef), tx.get(eventRef)]);
      if (!regSnap.exists) return false;
      if ((regSnap.data() as { userId: string }).userId !== userId) return false;

      const sessions = (eventSnap.data()?.sessions ?? []) as EventSession[];
      const index = sessions.findIndex((s) => s.id === sessionId);

      if (index >= 0 && sessions[index].capacity !== null) {
        const next = [...sessions];
        // Floored at zero: an inconsistency here should cost a place, never invent one.
        next[index] = {
          ...sessions[index],
          registered: Math.max(0, (sessions[index].registered ?? 0) - 1),
        };
        tx.update(eventRef, { sessions: next });
      }

      tx.delete(regRef);
      return true;
    });
  } catch (error) {
    reportError(error, { scope: 'sessions.cancel', eventId, sessionId, ticketId });
    return false;
  }
}

/** What this ticket is booked into, for the attendee's own agenda. */
export async function agendaFor(ticketId: string): Promise<string[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(REGISTRATIONS)
      .where('ticketId', '==', ticketId)
      .limit(100)
      .get();
    return snap.docs.map((d) => (d.data() as { sessionId: string }).sessionId);
  } catch (error) {
    reportError(error, { scope: 'sessions.agenda', ticketId });
    return [];
  }
}

/** The organiser's list for one session — who to expect in the room. */
export async function attendeesFor(
  eventId: string,
  sessionId: string
): Promise<Array<{ ticketId: string; userId: string }>> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(REGISTRATIONS)
      .where('eventId', '==', eventId)
      .where('sessionId', '==', sessionId)
      .limit(500)
      .get();
    return snap.docs.map((d) => d.data() as { ticketId: string; userId: string });
  } catch (error) {
    reportError(error, { scope: 'sessions.attendees', eventId, sessionId });
    return [];
  }
}
