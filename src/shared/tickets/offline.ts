import {
  ROTATION_SKEW,
  ROTATION_WINDOW_SECONDS,
  computeRotationCodeInBrowser,
} from '@/shared/tickets/rotating';
import type { TicketQrPayload } from '@/shared/tickets/qr';

/**
 * Deciding a scan with no signal.
 *
 * ## What offline mode gives up, stated plainly
 *
 * Online, redemption is a Firestore transaction: two doors scanning one ticket at the
 * same instant admit exactly one person, and that is enforced by the database. Offline
 * there is no shared database, so the guarantee weakens to **one door at a time**. A
 * device knows what it has admitted; it cannot know what the door at the other end of the
 * building admitted thirty seconds ago.
 *
 * That is not a bug to be engineered away — it is what "no network" means. What can be
 * done, and is, is to make the gap **auditable**: every offline redemption carries the
 * time it happened, and the sync reports any ticket admitted twice with both timestamps,
 * so the organiser knows the exact tickets to look at rather than suspecting the whole
 * night.
 *
 * ## What it does not give up
 *
 * The rotating code is still checked. The manifest carries each ticket's seed, so a
 * screenshot taken ten minutes ago fails offline exactly as it fails online — which is
 * the part most offline modes drop, because it is the part that needs the secret.
 */

export interface ManifestTicket {
  id: string;
  reference: string;
  attendeeName: string;
  tierName: string;
  seat?: string;
  status: string;
  /** Present when the ticket was issued after rotating codes existed. */
  rotationSeed?: string;
  qrSignature?: string;
}

export interface OfflineManifest {
  eventId: string;
  eventTitle: string;
  /** When it was taken. A stale manifest misses tickets bought since. */
  fetchedAt: string;
  tickets: ManifestTicket[];
}

/** A scan that happened while offline, waiting to be told to the server. */
export interface QueuedRedemption {
  ticketId: string;
  reference: string;
  eventId: string;
  /** When the person actually walked in, not when the queue drained. */
  at: string;
  deviceId: string;
}

export type OfflineDecision =
  | { admit: true; ticket: ManifestTicket }
  | {
      admit: false;
      kind: 'not-in-manifest' | 'already-used-here' | 'not-valid' | 'expired-code' | 'wrong-event';
      error: string;
      reference?: string;
    };

/**
 * Decide a scan against the downloaded manifest.
 *
 * `alreadyAdmitted` is this device's own record. It is the only duplicate check available
 * offline, and the reason the sync exists.
 */
export async function decideOffline(
  manifest: OfflineManifest,
  payload: TicketQrPayload,
  alreadyAdmitted: Set<string>,
  now: number = Date.now()
): Promise<OfflineDecision> {
  if (payload.e && payload.e !== manifest.eventId) {
    return {
      admit: false,
      kind: 'wrong-event',
      error: 'That ticket is for a different event.',
      reference: payload.r,
    };
  }

  const ticket = manifest.tickets.find((t) => t.id === payload.t);
  if (!ticket) {
    /*
     * Not in the manifest is not the same as fake. It is usually a ticket bought after
     * the manifest was downloaded, which is why the message says so and the door staff
     * are told to check rather than to accuse somebody at the front of a queue.
     */
    return {
      admit: false,
      kind: 'not-in-manifest',
      error: 'Not in the downloaded list — it may have been bought after you went offline.',
      reference: payload.r,
    };
  }

  if (ticket.status !== 'valid') {
    return {
      admit: false,
      kind: 'not-valid',
      error: `That ticket was ${ticket.status}.`,
      reference: ticket.reference,
    };
  }

  if (alreadyAdmitted.has(ticket.id)) {
    return {
      admit: false,
      kind: 'already-used-here',
      error: 'Already scanned on this device.',
      reference: ticket.reference,
    };
  }

  /*
   * The rotating code, checked with the ticket's own seed from the manifest — the same
   * computation the wallet runs to display it. A ticket issued before rotation existed
   * has no seed and falls back to its signature, exactly as online.
   */
  if (ticket.rotationSeed && payload.c) {
    /*
     * `computeRotationCodeInBrowser` takes a **timestamp**, not a window index — it does
     * the `rotationWindow()` conversion itself. Passing an index produced codes that
     * matched nothing, which failed open in the worst possible direction: every genuine
     * ticket refused at the door while every forgery was still refused, so the tests
     * looked half-right. The offsets are therefore in milliseconds.
     */
    const step = ROTATION_WINDOW_SECONDS * 1000;
    const times: number[] = [];
    for (let d = -ROTATION_SKEW; d <= ROTATION_SKEW; d += 1) times.push(now + d * step);

    const codes = await Promise.all(
      times.map((at) => computeRotationCodeInBrowser(ticket.rotationSeed!, ticket.id, at))
    );

    if (!codes.includes(payload.c)) {
      return {
        admit: false,
        kind: 'expired-code',
        error: 'That code has expired. Ask them to reopen the ticket.',
        reference: ticket.reference,
      };
    }
  }

  return { admit: true, ticket };
}

export interface SyncConflict {
  ticketId: string;
  reference: string;
  /** Every time this ticket was admitted, so the organiser can see the two doors. */
  times: string[];
}

/**
 * Find the tickets more than one door let in.
 *
 * Pure, and tested, because this is the whole reason offline mode is defensible: the
 * guarantee weakens from "cannot happen" to "cannot happen unnoticed", and this function
 * is the noticing.
 */
export function findConflicts(queue: QueuedRedemption[]): SyncConflict[] {
  const byTicket = new Map<string, QueuedRedemption[]>();
  for (const entry of queue) {
    byTicket.set(entry.ticketId, [...(byTicket.get(entry.ticketId) ?? []), entry]);
  }

  return [...byTicket.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([ticketId, entries]) => ({
      ticketId,
      reference: entries[0].reference,
      times: entries.map((e) => e.at).sort(),
    }));
}

/**
 * The order to send them in.
 *
 * Oldest first, so when two doors admitted one ticket the server records the redemption
 * at the time the **first** person walked in. Sending newest-first would stamp the
 * ticket with the later scan and quietly make the wrong person look like the original
 * holder.
 */
export function orderForSync(queue: QueuedRedemption[]): QueuedRedemption[] {
  return [...queue].sort((a, b) => a.at.localeCompare(b.at));
}
