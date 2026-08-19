import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * The media library: a record of what an organiser has uploaded, so it can be reused.
 *
 * ## Why a record at all, when the file is already in Storage
 *
 * Listing a bucket path is slow, unpaginated in any useful way, and tells you nothing
 * about which image is which. A row per file gives an organiser a picker with dimensions
 * and dates, and gives deletion something to check against — which is the part that
 * matters, because an image deleted while an event still points at it leaves a broken
 * hero on a page that is selling tickets.
 *
 * ## Bytes never pass through here
 *
 * The browser uploads straight to Storage, where `storage.rules` enforces the owner, the
 * content type and an 8MB ceiling at the service itself. This records what landed. Pushing
 * files through a Cloud Run request would spend its whole memory budget to enforce, more
 * weakly, a rule that is already enforced.
 */

const MEDIA = 'media';

export interface MediaItem {
  id: string;
  organizerId: string;
  url: string;
  path: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  createdAt: string;
}

export async function recordUpload(input: Omit<MediaItem, 'id' | 'createdAt'>): Promise<string | null> {
  if (!isAdminConfigured()) return null;

  // The path is the authority on ownership: Storage only accepted it because the rules
  // matched this organiser, so a mismatch here means the body was edited.
  if (!input.path.startsWith(`events/${input.organizerId}/`)) return null;

  try {
    const ref = await getAdminDb()
      .collection(MEDIA)
      .add({ ...input, createdAt: new Date().toISOString() });
    return ref.id;
  } catch (error) {
    reportError(error, { scope: 'media.record', organizerId: input.organizerId });
    return null;
  }
}

export async function listMedia(organizerId: string, limit = 200): Promise<MediaItem[]> {
  if (!isAdminConfigured()) return [];
  try {
    const snap = await getAdminDb()
      .collection(MEDIA)
      .where('organizerId', '==', organizerId)
      .limit(limit)
      .get();

    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as MediaItem)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch (error) {
    reportError(error, { scope: 'media.list', organizerId });
    return [];
  }
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'not-yours' | 'in-use' | 'unavailable'; usedBy?: string[] };

/**
 * Delete an image — unless something is still using it.
 *
 * An image removed from under a published event leaves a broken hero on a page that is
 * actively selling tickets, and nobody finds out until a customer mentions it. So the
 * events are checked first and the titles come back, which turns "cannot delete" into
 * "used by these three events" — an answer somebody can act on.
 */
export async function deleteMedia(id: string, organizerId: string): Promise<DeleteResult> {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' };

  const db = getAdminDb();

  try {
    const doc = await db.collection(MEDIA).doc(id).get();
    if (!doc.exists) return { ok: false, reason: 'not-yours' };

    const item = doc.data() as MediaItem;
    if (item.organizerId !== organizerId) return { ok: false, reason: 'not-yours' };

    /*
     * Who is using this image — as the event picture or as the cover.
     *
     * Only a LIVE event blocks deletion: published and not yet over, because that is
     * the page actively selling tickets that must never lose its hero. A cancelled or
     * past event holding a picture hostage was the live-testing complaint ("picture of
     * deleted or previous events cannot be deleted? why") — those pages still exist,
     * so instead of breaking them the reference is rewritten to the generated
     * placeholder and the deletion proceeds.
     */
    const [byImage, byCover] = await Promise.all([
      db
        .collection('events')
        .where('organizerId', '==', organizerId)
        .where('imageUrl', '==', item.url)
        .limit(10)
        .get(),
      db
        .collection('events')
        .where('organizerId', '==', organizerId)
        .where('coverImageUrl', '==', item.url)
        .limit(10)
        .get(),
    ]);

    const users = new Map(
      [...byImage.docs, ...byCover.docs].map((d) => [d.id, d] as const)
    );
    const now = Date.now();
    const live = [...users.values()].filter((d) => {
      const data = d.data();
      const over = new Date(String(data.endDate ?? data.date ?? '')).getTime() < now;
      return data.status === 'published' && !over;
    });

    if (live.length > 0) {
      return {
        ok: false,
        reason: 'in-use',
        usedBy: live.map((d) => String(d.data().title ?? 'Untitled event')),
      };
    }

    // Dead events release their claim: picture falls back to the generated
    // placeholder, cover falls back to the picture. Their pages keep rendering.
    const { eventImageSeed } = await import('@/shared/constants/placeholder-images');
    for (const doc2 of users.values()) {
      const data = doc2.data();
      const patch: Record<string, string> = {};
      if (data.imageUrl === item.url) {
        patch.imageUrl = eventImageSeed(String(data.title ?? doc2.id));
      }
      if (data.coverImageUrl === item.url) patch.coverImageUrl = '';
      await doc2.ref.update(patch);
    }

    /*
     * The Storage object goes first. If the file delete fails, the row survives and the
     * organiser can try again; the other order would leave an orphaned file that nothing
     * lists, paid for indefinitely, with no way to find it.
     */
    try {
      const { getStorage } = await import('firebase-admin/storage');
      await getStorage().bucket().file(item.path).delete({ ignoreNotFound: true });
    } catch (error) {
      reportError(error, { scope: 'media.deleteFile', path: item.path });
      return { ok: false, reason: 'unavailable' };
    }

    await doc.ref.delete();
    return { ok: true };
  } catch (error) {
    reportError(error, { scope: 'media.delete', id });
    return { ok: false, reason: 'unavailable' };
  }
}

/** What the library is costing, for the organiser's own information. */
export async function mediaUsage(organizerId: string): Promise<{ files: number; bytes: number }> {
  const items = await listMedia(organizerId, 1000);
  return {
    files: items.length,
    bytes: items.reduce((total, item) => total + (item.bytes ?? 0), 0),
  };
}
