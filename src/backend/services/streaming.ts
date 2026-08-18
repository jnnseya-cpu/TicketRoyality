import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { StreamDetails } from '@/shared/types';

/**
 * Watching a livestream you hold a ticket for.
 *
 * ## The URL is the thing being protected
 *
 * Everything here exists so the embed URL is **absent from the response** unless the
 * caller holds a valid ticket. Sending it and hiding the player behind a condition is
 * theatre: anyone can read a page's source or its network tab.
 *
 * ## What this cannot do, said out loud
 *
 * A ticket holder can paste the link into a group chat and twenty people can watch.
 * Stopping that needs signed, short-lived playback URLs issued by a streaming provider —
 * a sixth vendor, and therefore a decision rather than a task. Until then access is gated
 * at the door, not at the pixel, and the organiser's form says so before they rely on it.
 *
 * What *is* mitigated: the link is not guessable, it is not in any page a non-holder can
 * load, and every view is recorded against a ticket. An organiser can see that one ticket
 * opened the stream from forty places and act on it.
 *
 * ## Watching is not redemption
 *
 * A stream view never touches ticket `status`. A hybrid event sells the same ticket for
 * the room and the stream; consuming it on a click would mean somebody who peeked at the
 * stream on the train could not get through the door.
 */

const VIEWS = 'stream_views';
const CHAT = 'stream_chat';

export type StreamAccess =
  | {
      ok: true;
      streamUrl: string;
      chatEnabled: boolean;
      isReplay: boolean;
      ticketId: string;
      attendeeName: string;
    }
  | {
      ok: false;
      status: 401 | 403 | 404 | 409 | 503;
      reason: 'no-ticket' | 'not-a-stream' | 'too-early' | 'ended' | 'unavailable';
      error: string;
      /** When the player opens, so the page can count down instead of just refusing. */
      opensAt?: string;
    };

/**
 * Decide access, and return the URL only if it is earned.
 *
 * The ticket is looked up by owner and event rather than by id from the request: a caller
 * naming a ticket id would only need to guess one to watch, and ids are not secrets.
 */
export async function streamAccessFor(eventId: string, userId: string): Promise<StreamAccess> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, reason: 'unavailable', error: 'The stream is unavailable.' };
  }

  const db = getAdminDb();

  try {
    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) {
      return { ok: false, status: 404, reason: 'not-a-stream', error: 'That event does not exist.' };
    }

    const event = eventSnap.data() as { date?: string; streamDetails?: StreamDetails };
    const stream = event.streamDetails;
    if (!stream?.streamUrl && !stream?.replayUrl) {
      return { ok: false, status: 404, reason: 'not-a-stream', error: 'This event is not streamed.' };
    }

    const tickets = await db
      .collection('tickets')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .limit(10)
      .get();

    // A redeemed ticket still watches: somebody who came to the room and went home early
    // paid for the whole thing.
    const ticket = tickets.docs
      .map((d) => ({ id: d.id, ...(d.data() as { status: string; attendeeName?: string }) }))
      .find((t) => t.status === 'valid' || t.status === 'redeemed');

    if (!ticket) {
      return {
        ok: false,
        status: 403,
        reason: 'no-ticket',
        error: 'You need a ticket for this event to watch.',
      };
    }

    const start = event.date ? new Date(event.date).getTime() : 0;
    const opensAt = start - (stream.openMinutesBefore ?? 15) * 60_000;
    const now = Date.now();

    // Doors, for a stream. Opening early is a courtesy; opening a day early means the
    // link is loose in the world for a day before anybody is watching it.
    if (start && now < opensAt) {
      return {
        ok: false,
        status: 409,
        reason: 'too-early',
        error: 'The stream has not opened yet.',
        opensAt: new Date(opensAt).toISOString(),
      };
    }

    /*
     * After the event, the replay if there is one — and only for as long as the organiser
     * said. An expired replay returns nothing rather than the live URL, which by then is
     * usually a dead embed anyway.
     */
    const isReplay = Boolean(start && now > start && stream.replayUrl);
    if (isReplay && stream.replayUntil && now > new Date(stream.replayUntil).getTime()) {
      return { ok: false, status: 409, reason: 'ended', error: 'The replay is no longer available.' };
    }

    const url = isReplay ? stream.replayUrl! : stream.streamUrl;
    if (!url) {
      return { ok: false, status: 409, reason: 'ended', error: 'This stream has finished.' };
    }

    return {
      ok: true,
      streamUrl: url,
      chatEnabled: Boolean(stream.chatEnabled),
      isReplay,
      ticketId: ticket.id,
      attendeeName: ticket.attendeeName ?? 'Viewer',
    };
  } catch (error) {
    reportError(error, { scope: 'stream.access', eventId });
    return { ok: false, status: 503, reason: 'unavailable', error: 'Could not open the stream.' };
  }
}

/**
 * Record that a ticket opened the stream.
 *
 * One document per ticket, updated rather than appended: the useful questions are how many
 * distinct tickets watched and whether any single one opened it from an implausible number
 * of places. A row per play would answer neither and cost far more to store.
 */
export async function recordStreamView(
  eventId: string,
  ticketId: string,
  userId: string
): Promise<void> {
  if (!isAdminConfigured()) return;
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await getAdminDb()
      .collection(VIEWS)
      .doc(`${eventId}__${ticketId}`)
      .set(
        {
          eventId,
          ticketId,
          userId,
          opens: FieldValue.increment(1),
          lastAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (error) {
    // A view that cannot be counted must never stop somebody watching what they paid for.
    reportError(error, { scope: 'stream.view', eventId, ticketId });
  }
}

/** How many distinct tickets watched, for the organiser's report. */
export async function streamAudience(eventId: string): Promise<{ viewers: number; opens: number }> {
  if (!isAdminConfigured()) return { viewers: 0, opens: 0 };
  try {
    const snap = await getAdminDb().collection(VIEWS).where('eventId', '==', eventId).limit(5000).get();
    return {
      viewers: snap.size,
      opens: snap.docs.reduce((total, d) => total + Number(d.data().opens ?? 0), 0),
    };
  } catch (error) {
    reportError(error, { scope: 'stream.audience', eventId });
    return { viewers: 0, opens: 0 };
  }
}

export type ChatResult =
  | { ok: true; id: string }
  | { ok: false; status: 400 | 403 | 429 | 503; error: string };

/** Slow enough to stop flooding, fast enough that a real conversation is not throttled. */
const CHAT_MIN_GAP_MS = 2_000;
const CHAT_MAX_LENGTH = 500;

/**
 * Post to the stream chat.
 *
 * Entitlement is re-checked here rather than trusted from the page: a chat that only the
 * player gated would be writable by anybody who found the endpoint. The display name comes
 * from the **ticket**, not from the request, so nobody can post as the organiser.
 */
export async function postChatMessage(
  eventId: string,
  userId: string,
  text: string
): Promise<ChatResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Chat is unavailable.' };

  const body = text.trim().slice(0, CHAT_MAX_LENGTH);
  if (!body) return { ok: false, status: 400, error: 'Nothing to say.' };

  const access = await streamAccessFor(eventId, userId);
  if (!access.ok) return { ok: false, status: 403, error: 'You need a ticket to join the chat.' };
  if (!access.chatEnabled) return { ok: false, status: 403, error: 'Chat is off for this event.' };

  const db = getAdminDb();

  try {
    // Rate limit per person, from their last message. Cheap, and it is the only flood
    // control a chat this size needs.
    const recent = await db
      .collection(CHAT)
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .orderBy('at', 'desc')
      .limit(1)
      .get();

    if (!recent.empty) {
      const last = new Date(recent.docs[0].data().at as string).getTime();
      if (Date.now() - last < CHAT_MIN_GAP_MS) {
        return { ok: false, status: 429, error: 'One moment — you are posting quickly.' };
      }
    }

    const ref = await db.collection(CHAT).add({
      eventId,
      userId,
      // From the ticket. A name taken from the request would let anybody post as staff.
      name: access.attendeeName,
      text: body,
      at: new Date().toISOString(),
      hidden: false,
    });

    return { ok: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'stream.chat', eventId });
    return { ok: false, status: 503, error: 'Could not send that.' };
  }
}

/** The organiser hiding a message. Hidden rather than deleted, so moderation is auditable. */
export async function hideChatMessage(
  messageId: string,
  eventId: string,
  callerUid: string
): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    const db = getAdminDb();
    const event = await db.collection('events').doc(eventId).get();
    if (event.data()?.organizerId !== callerUid) return false;

    await db.collection(CHAT).doc(messageId).update({
      hidden: true,
      hiddenBy: callerUid,
      hiddenAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    reportError(error, { scope: 'stream.moderate', messageId });
    return false;
  }
}
