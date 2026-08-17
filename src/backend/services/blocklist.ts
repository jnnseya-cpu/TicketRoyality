import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * The door blocklist.
 *
 * A venue that has barred someone needs the door to say so, and needs it to work on the
 * night rather than after a report is run. The person usually holds a genuine, paid,
 * unredeemed ticket — that is exactly the case a validity check cannot catch, because
 * nothing about the ticket is wrong.
 *
 * ## Refused, not invalidated
 *
 * A block **stops the scan**; it does not touch the ticket. The ticket stays `valid`, so
 * it can still be refunded through the path that exists, and lifting the block makes it
 * work again with no repair step. Marking it `cancelled` at the door would mean an
 * argument at the front of a queue permanently destroying something somebody paid for.
 *
 * ## Scope
 *
 * An entry belongs to an organiser. `eventId` narrows it to one event; absent means every
 * event that organiser runs, which is what a venue barring someone actually means. No
 * entry is ever platform-wide: one organiser must not be able to bar a customer from
 * somebody else's event.
 *
 * ## Matching
 *
 * By ticket reference — the specific ticket in front of you — or by email, which follows
 * the person across the tickets they buy. Email matching is honest about its limit: a new
 * address defeats it, and the entry exists to stop the person who walks up with the
 * ticket they bought, not a determined impersonator.
 */

export interface BlockEntry {
  id: string;
  organizerId: string;
  /** Absent means every event this organiser runs. */
  eventId?: string;
  kind: 'email' | 'reference';
  /** Lower-cased at write time so matching never depends on how it was typed. */
  value: string;
  reason: string;
  createdAt: string;
  createdBy: string;
}

const COLLECTION = 'blocklist';

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export async function addBlock(input: {
  organizerId: string;
  eventId?: string;
  kind: BlockEntry['kind'];
  value: string;
  reason: string;
  createdBy: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isAdminConfigured()) return { ok: false, error: 'The blocklist is unavailable.' };

  const value = normalise(input.value);
  if (!value) return { ok: false, error: 'Enter an email address or a ticket reference.' };
  if (input.kind === 'email' && !value.includes('@')) {
    return { ok: false, error: 'That does not look like an email address.' };
  }

  try {
    const ref = await getAdminDb()
      .collection(COLLECTION)
      .add({
        organizerId: input.organizerId,
        ...(input.eventId ? { eventId: input.eventId } : {}),
        kind: input.kind,
        value,
        // A reason is required. A blocklist nobody can explain is one nobody can defend,
        // and the door staff reading it are not the person who added it.
        reason: input.reason.trim().slice(0, 300) || 'No reason recorded',
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy,
      });
    return { ok: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'blocklist.add', organizerId: input.organizerId });
    return { ok: false, error: 'Could not add that entry.' };
  }
}

export async function removeBlock(id: string, organizerId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    const ref = getAdminDb().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    // Ownership checked against the document, never from the request.
    if (!snap.exists || snap.data()?.organizerId !== organizerId) return false;
    await ref.delete();
    return true;
  } catch (error) {
    reportError(error, { scope: 'blocklist.remove', id });
    return false;
  }
}

export async function listBlocks(organizerId: string): Promise<BlockEntry[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(COLLECTION)
      .where('organizerId', '==', organizerId)
      .limit(500)
      .get();

    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) }) as BlockEntry)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'blocklist.list', organizerId });
    return [];
  }
}

/**
 * The door question, in one indexed query.
 *
 * Reference and email are checked together with an `in` filter rather than two round
 * trips, because this runs on the critical path of every scan and a queue notices.
 *
 * Fails **open** on an error: a blocklist that cannot be read must not turn into a door
 * that admits nobody. A barred person getting in during an outage is a worse night; a
 * closed venue is a worse event, and the outage is reported either way.
 */
export async function blockedBy(
  organizerId: string,
  eventId: string,
  reference: string,
  email: string | undefined
): Promise<BlockEntry | null> {
  if (!isAdminConfigured()) return null;

  const values = [normalise(reference), normalise(email ?? '')].filter(Boolean);
  if (values.length === 0) return null;

  try {
    const snap = await getAdminDb()
      .collection(COLLECTION)
      .where('organizerId', '==', organizerId)
      .where('value', 'in', values)
      .limit(20)
      .get();

    for (const doc of snap.docs) {
      const entry = { id: doc.id, ...(doc.data() as object) } as BlockEntry;
      // An entry scoped to another event does not apply here.
      if (entry.eventId && entry.eventId !== eventId) continue;
      // A reference entry must not be satisfied by an email that happens to match, or
      // the other way round.
      if (entry.kind === 'reference' && entry.value !== normalise(reference)) continue;
      if (entry.kind === 'email' && entry.value !== normalise(email ?? '')) continue;
      return entry;
    }
    return null;
  } catch (error) {
    reportError(error, { scope: 'blocklist.check', organizerId, eventId });
    return null;
  }
}
