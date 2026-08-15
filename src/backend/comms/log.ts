import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { Channel, DeliveryRecord, DeliveryStatus } from '@/shared/comms/types';

/**
 * The delivery log.
 *
 * `dispatch()` used to build records with an in-process counter and return them to the
 * caller, which threw them away. That makes the one support question that matters on a
 * ticketing platform — "I paid and never got anything, what happened?" — unanswerable:
 * there was no record that a message was ever attempted, let alone whether it left the
 * building.
 *
 * Written through the Admin SDK. `firestore.rules` denies clients every write here and
 * grants read only to superusers, because a delivery log is a list of who was emailed
 * what and when.
 */

const COLLECTION = 'comms_deliveries';

export interface StoredDelivery extends DeliveryRecord {
  /** The event's audience at the time of sending, for filtering the console. */
  severity: string;
  /** Provider message id when one came back. */
  messageId?: string;
  /** True when the caller asked for a rehearsal rather than a real send. */
  sandbox: boolean;
}

/**
 * Appends records. Never throws.
 *
 * A logging failure must not fail the notification, and a notification failure must not
 * fail the business operation that triggered it. Both would trade a real outcome — the
 * refund, the ticket — for a bookkeeping problem.
 */
export async function recordDeliveries(records: StoredDelivery[]): Promise<void> {
  if (records.length === 0) return;
  if (!isAdminConfigured()) return;

  try {
    const db = getAdminDb();
    const batch = db.batch();
    for (const record of records) {
      // Firestore auto-ids, not the old in-process counter: two Cloud Run instances
      // both starting at dlv_1 would have collided and silently overwritten each
      // other's history.
      batch.set(db.collection(COLLECTION).doc(), record);
    }
    await batch.commit();
  } catch (error) {
    console.error('[comms/log] could not record deliveries', {
      count: records.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface DeliveryQuery {
  limit?: number;
  channel?: Channel;
  status?: DeliveryStatus;
  eventKey?: string;
}

/**
 * Recent deliveries, newest first. Never throws — an unreachable database yields an
 * empty log rather than a 500 on an admin page that is otherwise fine.
 */
export async function recentDeliveries(query: DeliveryQuery = {}): Promise<StoredDelivery[]> {
  if (!isAdminConfigured()) return [];

  try {
    let ref = getAdminDb().collection(COLLECTION).orderBy('at', 'desc').limit(query.limit ?? 100);

    // Applied server-side so a large log is never shipped to the browser to be filtered
    // there. Each of these needs a composite index with `at` — see firestore.indexes.json.
    if (query.channel) ref = ref.where('channel', '==', query.channel) as typeof ref;
    if (query.status) ref = ref.where('status', '==', query.status) as typeof ref;
    if (query.eventKey) ref = ref.where('eventKey', '==', query.eventKey) as typeof ref;

    const snapshot = await ref.get();
    return snapshot.docs.map((doc) => ({ ...(doc.data() as StoredDelivery), id: doc.id }));
  } catch (error) {
    console.error('[comms/log] delivery log unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export interface DeliverySummary {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  /** Failures in the window, which is the number worth alerting on. */
  failed: number;
}

export function summarise(records: StoredDelivery[]): DeliverySummary {
  const byStatus: Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    byChannel[record.channel] = (byChannel[record.channel] ?? 0) + 1;
  }

  return {
    total: records.length,
    byStatus,
    byChannel,
    failed: byStatus.failed ?? 0,
  };
}
