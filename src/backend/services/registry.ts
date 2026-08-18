import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

/**
 * A gift registry — a wedding list, a baby shower, a leaving collection.
 *
 * ## Why the total is held on the item and written in a transaction
 *
 * The number everybody looks at is "£240 of £400". Summing contributions on every read is
 * correct but slow on a page a hundred guests are refreshing, and incrementing outside a
 * transaction loses contributions when two guests give at once — which on a registry means
 * a couple thanking somebody for a gift the list forgot. So the running total is stored,
 * and it only ever moves inside a transaction that also writes the contribution row.
 *
 * ## Fully funded means closed
 *
 * A £400 blender that has been paid for is not a thing two more guests should be able to
 * buy. The check happens inside the same transaction as the increment, so a race cannot
 * overshoot — an item can be topped up to its target by two simultaneous guests, but not
 * past it by both.
 *
 * ## Not a donation
 *
 * A registry contribution buys a present for a person. It is not a gift to a charity, so
 * **no Gift Aid**, and it never touches the donation collection.
 */

const ITEMS = 'registry_items';
const CONTRIBUTIONS = 'registry_contributions';

export interface RegistryItem {
  id: string;
  eventId: string;
  organizerId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  targetMinor: number;
  raisedMinor: number;
  contributionCount: number;
  currency: string;
  /** Allows part-payments towards one thing, which is how a big item gets bought at all. */
  allowPartial: boolean;
}

export async function createItem(input: {
  eventId: string;
  organizerId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  targetMinor: number;
  currency?: string;
  allowPartial?: boolean;
}): Promise<string | null> {
  if (!isAdminConfigured()) return null;

  try {
    const ref = await getAdminDb()
      .collection(ITEMS)
      .add({
        eventId: input.eventId,
        organizerId: input.organizerId,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        targetMinor: Math.max(1, Math.round(input.targetMinor)),
        raisedMinor: 0,
        contributionCount: 0,
        currency: input.currency ?? 'GBP',
        allowPartial: input.allowPartial !== false,
        createdAt: new Date().toISOString(),
      });
    return ref.id;
  } catch (error) {
    reportError(error, { scope: 'registry.create', eventId: input.eventId });
    return null;
  }
}

export async function itemsFor(eventId: string): Promise<RegistryItem[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb().collection(ITEMS).where('eventId', '==', eventId).limit(300).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as RegistryItem)
      // Unfunded first: the list exists to be given from, and finished items at the top
      // is a list that looks done.
      .sort((a, b) => {
        const aDone = a.raisedMinor >= a.targetMinor ? 1 : 0;
        const bDone = b.raisedMinor >= b.targetMinor ? 1 : 0;
        return aDone - bDone || a.title.localeCompare(b.title);
      });
  } catch (error) {
    reportError(error, { scope: 'registry.list', eventId });
    return [];
  }
}

export type ContributionResult =
  | { ok: true; raisedMinor: number; funded: boolean }
  | {
      ok: false;
      reason: 'no-item' | 'funded' | 'too-much' | 'partial-not-allowed' | 'duplicate' | 'unavailable';
      error: string;
    };

/**
 * Record a contribution and move the total, in one transaction.
 *
 * Keyed on the payment provider's event id: a redelivered webhook finds the contribution
 * already written and moves nothing, so a guest who gave £50 is never shown as having
 * given £100.
 */
export async function recordContribution(input: {
  providerEventId: string;
  itemId: string;
  amountMinor: number;
  giverName: string;
  giverEmail: string;
  message?: string;
  userId?: string;
}): Promise<ContributionResult> {
  if (!isAdminConfigured()) {
    return { ok: false, reason: 'unavailable', error: 'The registry is unavailable.' };
  }

  const db = getAdminDb();
  const itemRef = db.collection(ITEMS).doc(input.itemId);
  const contributionRef = db.collection(CONTRIBUTIONS).doc(input.providerEventId);

  try {
    return await db.runTransaction<ContributionResult>(async (tx) => {
      const [itemSnap, existing] = await Promise.all([tx.get(itemRef), tx.get(contributionRef)]);

      // Already recorded. Not an error — Stripe redelivers, and the honest answer is that
      // nothing further happens.
      if (existing.exists) {
        return { ok: false, reason: 'duplicate', error: 'That contribution is already recorded.' };
      }

      if (!itemSnap.exists) {
        return { ok: false, reason: 'no-item', error: 'That gift is no longer on the list.' };
      }

      const item = itemSnap.data() as RegistryItem;
      const raised = item.raisedMinor ?? 0;
      const remaining = item.targetMinor - raised;

      if (remaining <= 0) {
        return { ok: false, reason: 'funded', error: 'That gift has already been bought.' };
      }

      if (!item.allowPartial && input.amountMinor < item.targetMinor) {
        return {
          ok: false,
          reason: 'partial-not-allowed',
          error: 'This gift is bought whole rather than in parts.',
        };
      }

      /*
       * More than is left. Refused rather than trimmed: taking £80 towards a £30 balance
       * and keeping the difference is not something to decide on somebody's behalf, and
       * the checkout that produced this amount showed them the remaining figure.
       */
      if (input.amountMinor > remaining) {
        return {
          ok: false,
          reason: 'too-much',
          error: `Only ${(remaining / 100).toFixed(2)} is left towards that gift.`,
        };
      }

      const nowRaised = raised + Math.round(input.amountMinor);

      tx.create(contributionRef, {
        itemId: input.itemId,
        eventId: item.eventId,
        organizerId: item.organizerId,
        amountMinor: Math.round(input.amountMinor),
        giverName: input.giverName || 'Anonymous',
        giverEmail: input.giverEmail,
        ...(input.message ? { message: input.message.slice(0, 500) } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        at: new Date().toISOString(),
      });

      tx.update(itemRef, {
        raisedMinor: nowRaised,
        contributionCount: (item.contributionCount ?? 0) + 1,
      });

      return { ok: true, raisedMinor: nowRaised, funded: nowRaised >= item.targetMinor };
    });
  } catch (error) {
    reportError(error, { scope: 'registry.contribute', itemId: input.itemId });
    return { ok: false, reason: 'unavailable', error: 'That contribution could not be recorded.' };
  }
}

/** Who gave what, for the thank-you letters. The organiser's own list only. */
export async function contributionsFor(
  organizerId: string
): Promise<Array<{ id: string; itemId: string; amountMinor: number; giverName: string; giverEmail: string; message?: string; at: string }>> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb()
      .collection(CONTRIBUTIONS)
      .where('organizerId', '==', organizerId)
      .limit(2000)
      .get();

    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as never)
      .sort((a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at));
  } catch (error) {
    reportError(error, { scope: 'registry.contributions', organizerId });
    return [];
  }
}
