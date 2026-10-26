import 'server-only';

import { runTask } from '@/backend/ai/gateway';
import { DynamicPricingInputSchema } from '@/backend/ai/schemas';
import { dynamicPricingTask } from '@/backend/ai/tasks';
import { reserveAiCall, recordAiSpend } from '@/backend/services/ai-usage';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { dispatch } from '@/backend/comms/dispatch';
import { evaluateAutoPricing, type TierSnapshot } from '@/shared/dynamic-auto-pricing';
import type { AutoPriceChange, DynamicPricing, PriceSuggestion, TicketTier } from '@/shared/types';

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

/* -------------------------------------------------------------------------- */
/* Automatic rule-based pricing (owner spec, 25 Oct 2026).                    */
/*                                                                            */
/* The AI flow above proposes and the organiser approves. This flow applies   */
/* deterministic rules automatically and notifies the organiser, who can undo */
/* within a window. The rules and bounds live in `shared/dynamic-auto-pricing`*/
/* (pure + unit-tested); everything money-moving here is a Firestore          */
/* transaction with a per-tier price guard so it never fights a manual edit.  */
/* -------------------------------------------------------------------------- */

const AUTO_LOG_CAP = 20;
const REVERT_WINDOW_HOURS = 24;

/**
 * Turn automatic pricing on or off. Enabling captures each tier's current price as its
 * baseline — the fixed reference every cap and floor is measured against — so repeated
 * changes can never compound past the bound.
 */
export async function setAutoPricing(
  eventId: string,
  uid: string,
  enabled: boolean
): Promise<{ ok: true; auto: boolean } | { ok: false; status: 400 | 403 | 404 | 503; error: string }> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };

  let event;
  try {
    event = await ownedEvent(eventId, uid);
  } catch {
    return { ok: false, status: 503, error: 'Could not read that event.' };
  }
  if (!event.ok) return { ok: false, status: event.status, error: event.error };

  const tiers = (event.data.ticketTiers ?? []) as TicketTier[];
  const existing = (event.data.dynamicPricing as DynamicPricing | undefined) ?? { enabled: false };

  try {
    if (enabled) {
      if (tiers.length === 0) {
        return { ok: false, status: 400, error: 'This event has no ticket tiers to price.' };
      }
      const baselines: Record<string, number> = {};
      const soldSnapshot: Record<string, number> = {};
      for (const tier of tiers) {
        baselines[tier.id] = tier.price;
        soldSnapshot[tier.id] = tier.sold ?? 0;
      }
      await event.ref.update({
        dynamicPricing: {
          ...existing,
          enabled: true,
          auto: true,
          baselines,
          soldSnapshot,
          autoChangedAt: {},
          lastSweptAt: new Date().toISOString(),
        },
      });
    } else {
      // Leave baselines/log in place for the record; just stop acting.
      await event.ref.update({ 'dynamicPricing.auto': false });
    }
    return { ok: true, auto: enabled };
  } catch {
    return { ok: false, status: 503, error: 'Could not change that setting.' };
  }
}

/**
 * Evaluate and apply automatic changes for ONE event, atomically. Reads the real
 * sell-through inside the transaction, runs the pure engine, and applies each change
 * only if the tier's live price still equals the price the rule reasoned about — so a
 * manual edit or a concurrent sweep can never be overwritten. Returns what it applied.
 */
export async function runAutoPricingForEvent(
  eventId: string,
  now = Date.now()
): Promise<AutoPriceChange[]> {
  if (!isAdminConfigured()) return [];
  const db = getAdminDb();
  const ref = db.collection('events').doc(eventId);
  const applied: AutoPriceChange[] = [];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const dp = data.dynamicPricing as DynamicPricing | undefined;
    if (dp?.auto !== true) return;

    const tiers = (data.ticketTiers ?? []) as TicketTier[];
    if (tiers.length === 0) return;

    const eventDate = new Date(String(data.date ?? '')).getTime();
    if (!Number.isFinite(eventDate) || eventDate < now) return;
    const daysUntilEvent = Math.round((eventDate - now) / DAY);

    const baselines = dp.baselines ?? {};
    const soldSnap = dp.soldSnapshot ?? {};
    const changedAt = dp.autoChangedAt ?? {};

    const snapshots: TierSnapshot[] = tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      baseline: baselines[tier.id] ?? tier.price,
      quantity: tier.quantity,
      sold: tier.sold ?? 0,
      held: tier.held ?? 0,
      lastChangeAt: changedAt[tier.id] ? new Date(changedAt[tier.id]).getTime() : undefined,
      soldAtLastSweep: soldSnap[tier.id] ?? (tier.sold ?? 0),
    }));

    const changes = evaluateAutoPricing({ now, daysUntilEvent, tiers: snapshots });
    const nowIso = new Date(now).toISOString();
    const revertIso = new Date(now + REVERT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const byId = new Map(changes.map((c) => [c.tierId, c]));

    const newChangedAt = { ...changedAt };
    const logEntries: AutoPriceChange[] = [];

    const newTiers = tiers.map((tier) => {
      const change = byId.get(tier.id);
      // The guard: only apply if the live price is still the one the rule reasoned about.
      if (change && tier.price === change.fromPrice) {
        newChangedAt[tier.id] = nowIso;
        const entry: AutoPriceChange = {
          tierId: change.tierId,
          tierName: change.tierName,
          fromPrice: change.fromPrice,
          toPrice: change.toPrice,
          direction: change.direction,
          trigger: change.trigger,
          at: nowIso,
          revertableUntil: revertIso,
        };
        logEntries.push(entry);
        applied.push(entry);
        return { ...tier, price: change.toPrice };
      }
      return tier;
    });

    // Snapshot current sold for every tier — the baseline for the next sweep's rush test.
    const newSoldSnap: Record<string, number> = {};
    for (const tier of tiers) newSoldSnap[tier.id] = tier.sold ?? 0;

    const newLog = [...logEntries, ...(dp.autoLog ?? [])].slice(0, AUTO_LOG_CAP);

    tx.update(ref, {
      ticketTiers: newTiers,
      'dynamicPricing.soldSnapshot': newSoldSnap,
      'dynamicPricing.autoChangedAt': newChangedAt,
      'dynamicPricing.lastSweptAt': nowIso,
      'dynamicPricing.autoLog': newLog,
    });
  });

  return applied;
}

/** Notify the organiser of the changes applied to one event. Best-effort, never throws. */
async function notifyAutoChanges(
  eventId: string,
  data: Record<string, unknown>,
  applied: AutoPriceChange[]
): Promise<void> {
  const organizerId = String(data.organizerId ?? '');
  if (!organizerId || applied.length === 0) return;
  let email: string | undefined;
  try {
    const user = await getAdminDb().collection('users').doc(organizerId).get();
    email = user.data()?.email as string | undefined;
  } catch {
    // fall through — in-app still delivers by userId
  }
  const title = String(data.title ?? 'your event');
  const lines = applied.map(
    (c) =>
      `${c.tierName}: ${c.fromPrice} → ${c.toPrice} (${c.direction}, ${c.trigger.replace('_', ' ')}).`
  );
  await dispatch({
    eventKey: 'pricing.auto_changed',
    recipient: { email, userId: organizerId },
    vars: { event: title },
    body: [
      'Automatic pricing updated one or more tiers for this event:',
      ...lines,
      `You can undo any of these from the event's dynamic-selling panel within ${REVERT_WINDOW_HOURS} hours.`,
    ],
    action: { label: 'Review pricing', url: `/dashboard/organiser/events/${eventId}/edit` },
  }).catch((error) => console.error('[auto-pricing] notify failed', { eventId, error: String(error) }));
}

/**
 * Sweep every event with automatic pricing on, apply changes, and notify. Called by the
 * pricing cron. Each event is independent — one failure cannot stop the rest.
 */
export async function sweepAutoPricing(
  now = Date.now()
): Promise<{ events: number; changes: number }> {
  if (!isAdminConfigured()) return { events: 0, changes: 0 };
  const db = getAdminDb();

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  try {
    const snap = await db.collection('events').where('dynamicPricing.auto', '==', true).get();
    docs = snap.docs;
  } catch (error) {
    console.error('[auto-pricing] sweep query failed', String(error));
    return { events: 0, changes: 0 };
  }

  let events = 0;
  let changes = 0;
  for (const doc of docs) {
    try {
      const applied = await runAutoPricingForEvent(doc.id, now);
      if (applied.length > 0) {
        events += 1;
        changes += applied.length;
        await notifyAutoChanges(doc.id, doc.data() as Record<string, unknown>, applied);
      }
    } catch (error) {
      console.error('[auto-pricing] event sweep failed', { eventId: doc.id, error: String(error) });
    }
  }
  return { events, changes };
}

/**
 * Undo one automatic change within its window. Restores the previous price only if the
 * tier is still sitting at the price the change set — otherwise the undo no longer
 * applies and says so rather than clobbering a newer value.
 */
export async function revertAutoChange(
  eventId: string,
  uid: string,
  tierId: string
): Promise<ApplyResult> {
  if (!isAdminConfigured()) return { ok: false, status: 503, error: 'Server is not configured.' };
  if (!tierId) return { ok: false, status: 400, error: 'No tier given.' };

  const db = getAdminDb();
  const ref = db.collection('events').doc(eventId);
  let result: ApplyResult = { ok: false, status: 404, error: 'Nothing to undo for that tier.' };

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        result = { ok: false, status: 404, error: 'That event no longer exists.' };
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      if (data.organizerId !== uid) {
        result = { ok: false, status: 403, error: 'That event belongs to another organiser.' };
        return;
      }
      const dp = data.dynamicPricing as DynamicPricing | undefined;
      const log = dp?.autoLog ?? [];
      const nowMs = Date.now();
      const idx = log.findIndex(
        (e) => e.tierId === tierId && !e.reverted && new Date(e.revertableUntil).getTime() >= nowMs
      );
      if (idx === -1) {
        result = {
          ok: false,
          status: 404,
          error: 'Nothing to undo for that tier, or the undo window has passed.',
        };
        return;
      }
      const entry = log[idx];
      const tiers = (data.ticketTiers ?? []) as TicketTier[];
      const target = tiers.find((t) => t.id === tierId);
      if (!target) {
        result = { ok: false, status: 404, error: 'That tier no longer exists.' };
        return;
      }
      if (target.price !== entry.toPrice) {
        result = {
          ok: false,
          status: 409,
          error: 'This tier has changed since the automatic update, so the undo no longer applies.',
        };
        return;
      }
      const newTiers = tiers.map((t) => (t.id === tierId ? { ...t, price: entry.fromPrice } : t));
      const newLog = log.map((e, i) => (i === idx ? { ...e, reverted: true } : e));
      const changedAt = { ...(dp?.autoChangedAt ?? {}), [tierId]: new Date(nowMs).toISOString() };
      tx.update(ref, {
        ticketTiers: newTiers,
        'dynamicPricing.autoLog': newLog,
        'dynamicPricing.autoChangedAt': changedAt,
      });
      result = { ok: true, tierId, price: entry.fromPrice };
    });
  } catch {
    return { ok: false, status: 503, error: 'Could not undo that change.' };
  }
  return result;
}
