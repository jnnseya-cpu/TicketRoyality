import 'server-only';

import { runTask } from '@/backend/ai/gateway';
import { DynamicPricingInputSchema } from '@/backend/ai/schemas';
import { dynamicPricingTask } from '@/backend/ai/tasks';
import { reserveAiCall, recordAiSpend } from '@/backend/services/ai-usage';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { PriceSuggestion, TicketTier } from '@/shared/types';

/**
 * AI dynamic selling.
 *
 * The organiser turns it on per event; the AI reads the real sell-through and proposes
 * a price per tier; the organiser applies what they agree with. Nothing changes price
 * without a person, and that is a decision rather than an omission — there are no
 * checkout inventory holds yet, so an automatic change can move the price underneath
 * someone who is already in a checkout session.
 *
 * Everything the model reasons from is read here, from Firestore, after the caller has
 * been proved to own the event. None of it is accepted from the request body: `sold`
 * and `quantity` *are* the argument for a price, so a client that could send them could
 * manufacture a sell-out and talk the model into any number it liked.
 */

const DAY = 24 * 60 * 60 * 1000;

export type ReviewResult =
  | { ok: true; summary: string; suggestions: PriceSuggestion[] }
  | { ok: false; status: 400 | 403 | 404 | 429 | 503; error: string };

export type ApplyResult =
  | { ok: true; tierId: string; price: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 503; error: string };

type Owned =
  | { ok: true; ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }
  | { ok: false; status: 403 | 404; error: string };

/** Loads the event and proves the caller owns it. One place, so neither route forgets. */
async function ownedEvent(eventId: string, uid: string): Promise<Owned> {
  const doc = await getAdminDb().collection('events').doc(eventId).get();
  if (!doc.exists) return { ok: false, status: 404, error: 'That event no longer exists.' };

  const data = doc.data() as Record<string, unknown>;
  if (data.organizerId !== uid) {
    // 403 rather than 404: the caller is authenticated and the event is public, so
    // hiding its existence buys nothing and makes a real mistake harder to diagnose.
    return { ok: false, status: 403, error: 'That event belongs to another organiser.' };
  }

  return { ok: true, ref: doc.ref, data };
}

/**
 * Turn dynamic selling on or off for an event.
 *
 * Switching it off clears the stored suggestions. Leaving them behind would show an
 * organiser a set of prices they could still apply from a feature they had turned off,
 * which is a confusing way to change a price by accident.
 */
export async function setDynamicPricing(
  eventId: string,
  uid: string,
  enabled: boolean
): Promise<{ ok: true; enabled: boolean } | { ok: false; status: 403 | 404 | 503; error: string }> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };

  let event;
  try {
    event = await ownedEvent(eventId, uid);
  } catch {
    return { ok: false, status: 503, error: 'Could not read that event.' };
  }
  if (!event.ok) return { ok: false, status: event.status, error: event.error };

  try {
    await event.ref.update({
      dynamicPricing: enabled
        ? { ...(event.data.dynamicPricing as object | undefined), enabled: true }
        : { enabled: false },
    });
    return { ok: true, enabled };
  } catch {
    return { ok: false, status: 503, error: 'Could not change that setting.' };
  }
}

export async function reviewPricing(eventId: string, uid: string): Promise<ReviewResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };

  let event;
  try {
    event = await ownedEvent(eventId, uid);
  } catch {
    return { ok: false, status: 503, error: 'Could not read that event.' };
  }
  if (!event.ok) return { ok: false, status: event.status, error: event.error };

  const { ref, data } = event;

  if ((data.dynamicPricing as { enabled?: boolean } | undefined)?.enabled !== true) {
    return { ok: false, status: 400, error: 'Dynamic selling is off for this event.' };
  }

  const tiers = (data.ticketTiers ?? []) as TicketTier[];
  if (tiers.length === 0) {
    return { ok: false, status: 400, error: 'This event has no ticket tiers to price.' };
  }

  const now = Date.now();
  const eventDate = new Date(String(data.date ?? '')).getTime();
  const createdAt = new Date(String(data.createdAt ?? '')).getTime();

  if (!Number.isFinite(eventDate)) {
    return { ok: false, status: 400, error: 'This event has no usable date.' };
  }
  if (eventDate < now) {
    // Not an error worth a 400 elsewhere, but repricing a past event is meaningless and
    // would spend ACU to say so.
    return { ok: false, status: 400, error: 'This event has already happened.' };
  }

  // Validated even though it was assembled here rather than received. A tier with a
  // missing price or a NaN count would otherwise reach three providers in turn and be
  // billed for the privilege of returning nonsense.
  const input = DynamicPricingInputSchema.safeParse({
    eventTitle: String(data.title ?? ''),
    category: String(data.category ?? ''),
    location: String(data.location ?? ''),
    currency: String(data.currency ?? 'GBP'),
    daysUntilEvent: Math.round((eventDate - now) / DAY),
    daysOnSale: Number.isFinite(createdAt) ? Math.max(0, Math.round((now - createdAt) / DAY)) : 0,
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      quantity: tier.quantity,
      sold: tier.sold ?? 0,
    })),
  });

  if (!input.success) {
    return {
      ok: false,
      status: 400,
      error: 'This event’s tiers are incomplete, so there is nothing reliable to price from.',
    };
  }

  // Count this against the organiser's shared daily AI allowance before the paid call.
  // Ownership is already proven, but "your own event" is not a licence to spend the
  // platform's provider budget without limit by re-reviewing on a loop.
  const reservation = await reserveAiCall(uid);
  if (!reservation.ok) {
    return {
      ok: false,
      status: reservation.reason === 'over_cap' ? 429 : 503,
      error:
        reservation.reason === 'over_cap'
          ? 'Daily AI limit reached. Try again tomorrow.'
          : 'AI is temporarily unavailable — try again shortly.',
    };
  }

  try {
    const result = await runTask(dynamicPricingTask, input.data);

    // Record the real provider cost against the caller; internal, never returned.
    await recordAiSpend(uid, result.billing);

    const byId = new Map(tiers.map((tier) => [tier.id, tier]));
    const suggestions: PriceSuggestion[] = result.output.suggestions.flatMap((s) => {
      const tier = byId.get(s.tierId);
      if (!tier) return [];
      return [
        {
          tierId: s.tierId,
          tierName: tier.name,
          currentPrice: tier.price,
          suggestedPrice: s.suggestedPrice,
          reason: s.reason,
        },
      ];
    });

    const stored = {
      enabled: true,
      lastReviewedAt: new Date().toISOString(),
      summary: result.output.summary,
      suggestions,
    };

    await ref.update({ dynamicPricing: stored });

    // `result.billing` carries the provider cost and the markup and is never returned.
    return { ok: true, summary: stored.summary, suggestions };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[dynamic-pricing] review failed', { eventId, error: message });
    return {
      ok: false,
      status: 503,
      error: 'No AI provider could complete the review. Nothing was changed — try again shortly.',
    };
  }
}

/**
 * Apply one suggestion.
 *
 * The price comes from the stored suggestion, not from the request: the client sends a
 * tier id and nothing else. The whole point of the approval step is that a human agreed
 * to a number the server produced, and letting the browser post the number back would
 * turn "approve this price" into "set any price", which is the same authority the
 * organiser would have had with no AI at all.
 */
export async function applySuggestion(
  eventId: string,
  uid: string,
  tierId: string
): Promise<ApplyResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };
  if (!tierId) return { ok: false, status: 400, error: 'No tier given.' };

  let event;
  try {
    event = await ownedEvent(eventId, uid);
  } catch {
    return { ok: false, status: 503, error: 'Could not read that event.' };
  }
  if (!event.ok) return { ok: false, status: event.status, error: event.error };

  const { ref, data } = event;
  const pricing = data.dynamicPricing as
    | { suggestions?: PriceSuggestion[]; summary?: string; lastReviewedAt?: string }
    | undefined;

  const suggestion = pricing?.suggestions?.find((s) => s.tierId === tierId);
  if (!suggestion) {
    return { ok: false, status: 404, error: 'That suggestion is no longer available. Review again.' };
  }

  const tiers = (data.ticketTiers ?? []) as TicketTier[];
  const target = tiers.find((tier) => tier.id === tierId);
  if (!target) return { ok: false, status: 404, error: 'That tier no longer exists.' };

  // The suggestion recorded the price it was reasoning about. If the organiser has
  // edited the tier since, the reasoning no longer applies to the tier in front of them.
  if (target.price !== suggestion.currentPrice) {
    return {
      ok: false,
      status: 409,
      error: 'This tier has been edited since the review. Run the review again.',
    };
  }

  try {
    await ref.update({
      ticketTiers: tiers.map((tier) =>
        tier.id === tierId ? { ...tier, price: suggestion.suggestedPrice } : tier
      ),
      // The applied suggestion is consumed, so it cannot be applied twice on top of
      // itself. The others stay — the organiser may want some and not others.
      'dynamicPricing.suggestions': (pricing?.suggestions ?? []).filter((s) => s.tierId !== tierId),
    });

    return { ok: true, tierId, price: suggestion.suggestedPrice };
  } catch (error) {
    console.error('[dynamic-pricing] apply failed', { eventId, tierId, error: String(error) });
    return { ok: false, status: 503, error: 'Could not update that price.' };
  }
}
