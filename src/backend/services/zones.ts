import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { VenueZone } from '@/shared/types';

/**
 * Venue zones — doors inside the venue.
 *
 * ## Why this is separate from redemption
 *
 * A ticket redeems **once**: valid → redeemed, at the main gate. That property is
 * transactional, tested, and enforced in `firestore.rules`, and it is what stops one
 * ticket admitting two people. Zones must not weaken it.
 *
 * So a zone scan is a different thing recorded separately. Entering the hospitality
 * lounge does not consume the ticket, because the holder is expected to come back out
 * and go to their seat. What a zone scan checks is *may this ticket be in this room, and
 * is the room full* — and it answers that without touching `status` at all.
 *
 * That separation is why re-entry works. A model that reused `redeemed` for zones would
 * need a ticket to un-redeem itself every time someone stepped outside for air, which is
 * exactly the state transition the rules forbid for good reason.
 *
 * ## Occupancy is live, not cumulative
 *
 * `occupancy` counts who is *inside now*, so a zone with a fire-safety limit reports the
 * number that limit is about. A cumulative admission count would read 400 for a room
 * that holds 200 and currently contains 12.
 */

export type ZoneResult =
  | { ok: true; zoneName: string; occupancy: number; capacity: number | null; direction: 'in' | 'out' }
  | {
      ok: false;
      status: 403 | 404 | 409 | 503;
      kind: 'wrong-tier' | 'zone-full' | 'no-reentry' | 'no-zone' | 'no-ticket' | 'unavailable';
      error: string;
      zoneName?: string;
    };

interface AdmissionDoc {
  ticketId: string;
  eventId: string;
  zoneId: string;
  inside: boolean;
  enteredAt: string;
  exitedAt?: string;
  entries: number;
}

/** One document per ticket per zone, so an admission is idempotent by construction. */
function admissionId(ticketId: string, zoneId: string): string {
  return `${ticketId}__${zoneId}`;
}

/**
 * Admit a ticket to a zone, or turn it away with a reason the door staff can read aloud.
 *
 * Everything happens in one transaction: the tier check, the capacity check, the
 * occupancy increment and the admission record. Two doors into the same zone scanning at
 * the same instant cannot both take the last place.
 */
export async function admitToZone(
  ticketId: string,
  eventId: string,
  zoneId: string,
  direction: 'in' | 'out' = 'in'
): Promise<ZoneResult> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, kind: 'unavailable', error: 'Zone scanning is unavailable.' };
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const ticketRef = db.collection('tickets').doc(ticketId);
  const admissionRef = db.collection('zone_admissions').doc(admissionId(ticketId, zoneId));

  try {
    return await db.runTransaction<ZoneResult>(async (tx) => {
      const [eventSnap, ticketSnap, admissionSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(ticketRef),
        tx.get(admissionRef),
      ]);

      if (!eventSnap.exists) {
        return { ok: false, status: 404, kind: 'no-zone', error: 'That event does not exist.' };
      }
      if (!ticketSnap.exists) {
        return { ok: false, status: 404, kind: 'no-ticket', error: 'No such ticket.' };
      }

      const zones = (eventSnap.data()?.zones ?? []) as VenueZone[];
      const index = zones.findIndex((z) => z.id === zoneId);
      if (index < 0) {
        return { ok: false, status: 404, kind: 'no-zone', error: 'That zone is not on this event.' };
      }

      const zone = zones[index];
      const ticket = ticketSnap.data() as { tierId?: string; status: string; eventId: string };

      if (ticket.eventId !== eventId) {
        return {
          ok: false,
          status: 409,
          kind: 'no-ticket',
          error: 'That ticket is for a different event.',
          zoneName: zone.name,
        };
      }

      // A refunded ticket must not wander the venue even if it was scanned in earlier.
      if (ticket.status === 'refunded' || ticket.status === 'cancelled') {
        return {
          ok: false,
          status: 409,
          kind: 'no-ticket',
          error: `That ticket was ${ticket.status}.`,
          zoneName: zone.name,
        };
      }

      const admission = admissionSnap.exists ? (admissionSnap.data() as AdmissionDoc) : undefined;

      /* Leaving. Always allowed — a door that will not let someone out is a fire hazard,
         not a security feature. Recorded so occupancy stays honest. */
      if (direction === 'out') {
        if (!admission?.inside) {
          return {
            ok: false,
            status: 409,
            kind: 'no-reentry',
            error: 'That ticket is not currently inside this zone.',
            zoneName: zone.name,
          };
        }

        const next = [...zones];
        next[index] = { ...zone, occupancy: Math.max(0, (zone.occupancy ?? 0) - 1) };
        tx.update(eventRef, { zones: next });
        tx.update(admissionRef, { inside: false, exitedAt: new Date().toISOString() });

        return {
          ok: true,
          zoneName: zone.name,
          occupancy: next[index].occupancy ?? 0,
          capacity: zone.capacity,
          direction: 'out',
        };
      }

      // An empty allow-list is a main gate: it admits every tier.
      if (zone.allowedTierIds.length > 0 && !zone.allowedTierIds.includes(ticket.tierId ?? '')) {
        return {
          ok: false,
          status: 403,
          kind: 'wrong-tier',
          error: `This ticket is not admitted to ${zone.name}.`,
          zoneName: zone.name,
        };
      }

      if (admission?.inside) {
        return {
          ok: false,
          status: 409,
          kind: 'no-reentry',
          error: 'Already inside this zone.',
          zoneName: zone.name,
        };
      }

      if (admission && !zone.reEntry) {
        return {
          ok: false,
          status: 409,
          kind: 'no-reentry',
          error: `${zone.name} does not allow re-entry.`,
          zoneName: zone.name,
        };
      }

      const occupancy = zone.occupancy ?? 0;
      if (zone.capacity !== null && occupancy >= zone.capacity) {
        return {
          ok: false,
          status: 409,
          kind: 'zone-full',
          error: `${zone.name} is full — ${occupancy} of ${zone.capacity}.`,
          zoneName: zone.name,
        };
      }

      const next = [...zones];
      next[index] = { ...zone, occupancy: occupancy + 1 };
      tx.update(eventRef, { zones: next });

      tx.set(admissionRef, {
        ticketId,
        eventId,
        zoneId,
        inside: true,
        enteredAt: new Date().toISOString(),
        entries: (admission?.entries ?? 0) + 1,
      } satisfies AdmissionDoc);

      return {
        ok: true,
        zoneName: zone.name,
        occupancy: occupancy + 1,
        capacity: zone.capacity,
        direction: 'in',
      };
    });
  } catch (error) {
    reportError(error, { scope: 'zones.admit', ticketId, eventId, zoneId });
    return { ok: false, status: 503, kind: 'unavailable', error: 'Could not reach the zone.' };
  }
}

/** Live occupancy for an organiser's board. Reads the event, not the admission log. */
export async function zoneOccupancy(eventId: string): Promise<VenueZone[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb().collection('events').doc(eventId).get();
    return (snap.data()?.zones ?? []) as VenueZone[];
  } catch (error) {
    reportError(error, { scope: 'zones.occupancy', eventId });
    return [];
  }
}
