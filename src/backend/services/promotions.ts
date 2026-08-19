import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { placementById } from '@/shared/placements';

/**
 * Paid homepage and newsletter placements — bought self-serve, active on payment.
 *
 * ## Why activation lives here and not in the webhook route
 *
 * The Stripe webhook is the only caller today, but activation is a transaction over two
 * documents (the placement record and the event) and the cron that expires placements
 * needs the same vocabulary. One module owns the flags; routes stay thin.
 *
 * ## Idempotency
 *
 * The placement record's document id is the provider event id, enforced by `create()`
 * inside the transaction. A redelivered webhook finds the document and changes nothing —
 * the same rule as ticket issuance, because a placement paid for once must never bill
 * twice or extend twice.
 *
 * ## What each placement sets
 *
 * - `video-ad`   → `spotlight` + `spotlightUntil` — the homepage strip.
 * - `featured`   → `featured` + `featuredUntil` — the featured grid AND the strip.
 * - `newsletter` → `newsletterSpotlight` — consumed by the next completed weekly send.
 *
 * A manual grant from the superuser dashboard sets `featured` with NO `featuredUntil`,
 * so the expiry cron deliberately never touches it: only paid time runs out.
 */

export interface PlacementActivation {
  providerEventId: string;
  placementId: string;
  eventId: string;
  /** The paying organiser, from the checkout metadata. */
  userId: string;
  amountMajor: number;
  currency: string;
}

export async function activatePlacement(
  activation: PlacementActivation
): Promise<'activated' | 'duplicate' | 'invalid' | 'unavailable'> {
  const placement = placementById(activation.placementId);
  if (!placement || !activation.eventId) return 'invalid';
  if (!isAdminConfigured()) return 'unavailable';

  const db = getAdminDb();
  const placementRef = db.collection('placements').doc(activation.providerEventId);
  const eventRef = db.collection('events').doc(activation.eventId);

  try {
    return await db.runTransaction(async (tx) => {
      const existing = await tx.get(placementRef);
      if (existing.exists) return 'duplicate' as const;

      const eventSnap = await tx.get(eventRef);
      // The event vanished between payment and webhook. The record is still written —
      // money arrived and must be visible — but there is nothing to flag.
      const eventExists = eventSnap.exists;

      const now = new Date();
      const expiresAt = placement.days
        ? new Date(now.getTime() + placement.days * 86_400_000).toISOString()
        : null;

      tx.create(placementRef, {
        placementId: placement.id,
        placementTitle: placement.title,
        eventId: activation.eventId,
        organizerId: activation.userId,
        amountMajor: activation.amountMajor,
        currency: activation.currency,
        purchasedAt: now.toISOString(),
        expiresAt,
        status: eventExists ? 'active' : 'orphaned',
      });

      if (eventExists) {
        if (placement.id === 'video-ad') {
          tx.update(eventRef, { spotlight: true, spotlightUntil: expiresAt });
        } else if (placement.id === 'featured') {
          // Granting consumes any standing request, exactly as a manual grant does.
          tx.update(eventRef, {
            featured: true,
            featuredUntil: expiresAt,
            featuredRequested: false,
          });
        } else {
          tx.update(eventRef, { newsletterSpotlight: true });
        }
      }

      return 'activated' as const;
    });
  } catch (error) {
    console.error('[promotions] activation failed', {
      providerEventId: activation.providerEventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unavailable';
  }
}

/**
 * Ends paid placements whose term has lapsed. Hourly from cron; a placement running an
 * extra fifty minutes costs nobody anything, and the timestamp means a missed run can
 * never leave a slot live indefinitely.
 *
 * Only documents carrying an `…Until` are touched — a manual grant has none and stands
 * until a superuser removes it.
 */
export async function expirePlacements(now = new Date()): Promise<{ expired: number }> {
  if (!isAdminConfigured()) return { expired: 0 };

  const db = getAdminDb();
  const cutoff = now.toISOString();
  let expired = 0;

  // Single-field queries with the date compared in memory: live placements number in
  // the tens at most, and an equality+range pair would demand a composite index whose
  // absence fails the cron silently in exactly the environment nobody is watching.
  const [spotlights, featured] = await Promise.all([
    db.collection('events').where('spotlight', '==', true).get(),
    db.collection('events').where('featured', '==', true).get(),
  ]);

  for (const doc of spotlights.docs) {
    const until = doc.data().spotlightUntil as string | undefined;
    if (until && until <= cutoff) {
      await doc.ref.update({ spotlight: false, spotlightUntil: null });
      expired += 1;
    }
  }
  for (const doc of featured.docs) {
    const until = doc.data().featuredUntil as string | undefined;
    if (until && until <= cutoff) {
      await doc.ref.update({ featured: false, featuredUntil: null });
      expired += 1;
    }
  }

  return { expired };
}
