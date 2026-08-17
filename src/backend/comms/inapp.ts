import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import type { CommsEvent } from '@/shared/comms/types';

/**
 * In-app notification delivery.
 *
 * 177 catalogue events declare `inapp` as a channel and every one of them recorded
 * `suppressed: inapp delivery is not implemented`. That was honest, and it was also the
 * single largest gap between what the comms system claimed to route and what a user ever
 * saw: a refund processed, an organiser approved, a payout sent — all of it landed in a
 * delivery log nobody outside the admin console reads.
 *
 * ## Why Firestore and not a queue
 *
 * A notification is a document the recipient owns. Firestore already gives per-user
 * access rules and a live subscription, so the bell updates without polling and without
 * a second piece of infrastructure. There is no vendor here at all.
 *
 * ## Why the whole message is stored
 *
 * The alternative is storing an event key and re-rendering from the catalogue when it is
 * read. That breaks the moment a subject line changes: a user opens a six-month-old
 * notification and sees today's wording for yesterday's event. What was sent is what is
 * kept.
 */

export interface InAppNotification {
  userId: string;
  eventKey: string;
  title: string;
  body: string;
  severity: CommsEvent['severity'];
  /** Where the notification takes you, if anywhere. */
  actionLabel?: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string;
}

/**
 * Cap on what a single user accumulates.
 *
 * An account attending many events across a year would otherwise hold thousands of
 * documents, and every bell open would read all of them. Trimmed on write rather than
 * swept: the write already knows whose list it grew.
 */
const KEEP_PER_USER = 200;

export interface InAppResult {
  delivered: boolean;
  id?: string;
  reason?: string;
}

export async function deliverInApp(input: {
  userId: string;
  eventKey: string;
  title: string;
  body: string;
  severity: CommsEvent['severity'];
  action?: { label: string; url: string };
}): Promise<InAppResult> {
  if (!isAdminConfigured()) {
    return { delivered: false, reason: 'Datastore is not configured' };
  }
  if (!input.userId) {
    // The catalogue routes some events to an audience with no signed-in user — an
    // abandoned registration, for one. Not a failure worth reporting as an error.
    return { delivered: false, reason: 'No recipient user id' };
  }

  const db = getAdminDb();

  try {
    const ref = await db.collection('notifications').add({
      userId: input.userId,
      eventKey: input.eventKey,
      title: input.title,
      body: input.body,
      severity: input.severity,
      ...(input.action ? { actionLabel: input.action.label, actionUrl: input.action.url } : {}),
      createdAt: new Date().toISOString(),
    } satisfies InAppNotification);

    void trim(input.userId).catch(() => undefined);

    return { delivered: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'comms.inapp', userId: input.userId, eventKey: input.eventKey });
    return { delivered: false, reason: 'Could not write the notification' };
  }
}

/** Drops the oldest beyond the cap. Best-effort — a full list is not a failed delivery. */
async function trim(userId: string): Promise<void> {
  const db = getAdminDb();
  const snap = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .offset(KEEP_PER_USER)
    .limit(100)
    .get();

  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
}

/** Marks one notification read. Only ever the caller's own — enforced by the rules too. */
export async function markRead(userId: string, id: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    const ref = getAdminDb().collection('notifications').doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as InAppNotification).userId !== userId) return false;
    await ref.update({ readAt: new Date().toISOString() });
    return true;
  } catch (error) {
    reportError(error, { scope: 'comms.inapp.read', userId });
    return false;
  }
}

export async function markAllRead(userId: string): Promise<number> {
  if (!isAdminConfigured()) return 0;
  try {
    const db = getAdminDb();
    const snap = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .where('readAt', '==', null)
      .limit(300)
      .get();

    // `readAt == null` only matches documents that carry the field explicitly, so the
    // unread ones — which have no `readAt` at all — need the broader read below.
    const unread = snap.empty
      ? (await db.collection('notifications').where('userId', '==', userId).limit(300).get()).docs.filter(
          (d) => !(d.data() as InAppNotification).readAt
        )
      : snap.docs;

    if (unread.length === 0) return 0;

    const batch = db.batch();
    const now = new Date().toISOString();
    for (const doc of unread) batch.update(doc.ref, { readAt: now });
    await batch.commit();
    return unread.length;
  } catch (error) {
    reportError(error, { scope: 'comms.inapp.read-all', userId });
    return 0;
  }
}
