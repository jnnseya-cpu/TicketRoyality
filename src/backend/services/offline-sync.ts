import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { orderForSync, type QueuedRedemption } from '@/shared/tickets/offline';

/**
 * Applying the scans a door made while it had no signal.
 *
 * ## Late, not wrong
 *
 * Each redemption carries the time the person actually walked in, and that is what gets
 * written — not the time the queue drained. A door that reconnects at midnight must not
 * stamp every ticket from an eight o'clock rush as midnight, because the arrival curve is
 * the number the organiser staffs the next event from.
 *
 * ## A ticket already redeemed is reported, never overwritten
 *
 * If the ticket was admitted online in the meantime — or by another offline door that
 * synced first — this does **not** move the timestamp. The first admission stands and the
 * second is returned as a conflict, with both times, so the organiser has the exact
 * tickets to look at rather than a suspicion about the whole night. Silently accepting
 * the later scan would erase the evidence that two people used one ticket.
 *
 * ## Idempotent by ticket
 *
 * A sync that fails halfway is retried whole. Re-sending a redemption that already landed
 * finds the ticket redeemed at that exact time and reports nothing.
 */

export interface SyncOutcome {
  applied: number;
  /** Tickets that were already redeemed when the queue arrived. */
  conflicts: Array<{ ticketId: string; reference: string; existingAt?: string; attemptedAt: string }>;
  /** Entries the server could not match at all. */
  unknown: string[];
}

export async function applyOfflineRedemptions(
  eventId: string,
  callerUid: string,
  queue: QueuedRedemption[]
): Promise<SyncOutcome | null> {
  if (!isAdminConfigured()) return null;

  const db = getAdminDb();

  // The door's authority is checked once for the batch rather than per ticket: it is the
  // same question, and asking it a thousand times is a thousand reads.
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) return null;

  const isOwner = eventSnap.data()?.organizerId === callerUid;
  const isAdmin =
    (await db.collection('users').doc(callerUid).get()).data()?.userType === 'superuser';
  if (!isOwner && !isAdmin) return null;

  const outcome: SyncOutcome = { applied: 0, conflicts: [], unknown: [] };

  for (const entry of orderForSync(queue)) {
    const ref = db.collection('tickets').doc(entry.ticketId);

    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { kind: 'unknown' as const };

        const ticket = snap.data() as { status: string; eventId: string; redeemedAt?: string; reference?: string };
        if (ticket.eventId !== eventId) return { kind: 'unknown' as const };

        if (ticket.status === 'redeemed') {
          // Already in. Whether that was this same scan replayed or a different door,
          // the first admission stands and this is reported.
          return {
            kind: 'conflict' as const,
            existingAt: ticket.redeemedAt,
            reference: ticket.reference ?? entry.reference,
          };
        }
        if (ticket.status !== 'valid') {
          return { kind: 'conflict' as const, existingAt: undefined, reference: ticket.reference ?? entry.reference };
        }

        tx.update(ref, {
          status: 'redeemed',
          // The time they walked in, not the time the queue drained.
          redeemedAt: entry.at,
          redeemedOffline: true,
          redeemedByDevice: entry.deviceId,
        });
        return { kind: 'applied' as const };
      });

      if (result.kind === 'applied') outcome.applied += 1;
      else if (result.kind === 'unknown') outcome.unknown.push(entry.ticketId);
      else
        outcome.conflicts.push({
          ticketId: entry.ticketId,
          reference: result.reference,
          existingAt: result.existingAt,
          attemptedAt: entry.at,
        });
    } catch (error) {
      reportError(error, { scope: 'offline.sync', ticketId: entry.ticketId, eventId });
      // Left out of `applied`, so the device keeps it queued and tries again. Dropping it
      // would lose the record that somebody was admitted.
    }
  }

  return outcome;
}
