import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { parseGrowthBrief, isBriefFresh, type GrowthBrief } from '@/shared/trend/growth-brief';

/**
 * Effective-brief resolver — NATIVE (external spec §4, §14 step 5), embedded in this
 * platform rather than calling any separate engine.
 *
 * TicketRoyality produces, approves and stores its own Growth Briefs; this is the one
 * call its existing agents make before drafting: "resolve the active approved brief for
 * this market, locale, channel and topic". Its defining property is that it **fails safe
 * to the platform's baseline behaviour** — on no active brief, a datastore error, an
 * invalid stored payload or a stale brief, it returns `baseline`, never an exception and
 * never a half-resolved brief. A brief is applied only when schema-valid AND fresh.
 *
 * The active brief lives at `growth_brief_active/{scopeKey}` so resolution is a single
 * read with no index. Caching is bounded exactly as the spec requires: within a
 * 60-second ceiling and **never beyond the brief's own expiry**. The cache is never the
 * authority to write or publish, and nothing here grants an agent new scope.
 *
 * Dormant until briefs exist: with none written, every call returns baseline, so the
 * platform behaves exactly as it does today.
 */

export interface BriefScope {
  /** ISO alpha-2 market, matching the brief's `market`. */
  market: string;
  locale: string;
  /** The channel asking (e.g. 'seo', 'organic_social'). */
  channel: string;
  topic?: string;
}

export type BaselineReason =
  | 'no_active_brief'
  | 'datastore_unavailable'
  | 'invalid_brief'
  | 'stale_brief';

export type EffectiveBrief =
  | { kind: 'brief'; brief: GrowthBrief }
  | { kind: 'baseline'; reason: BaselineReason };

/** Loads the raw stored brief for a scope, or null if there is no active one. */
export type BriefLoader = (scope: BriefScope) => Promise<unknown | null>;

/** §14: cache within a 60-second ceiling. */
const CACHE_CEILING_MS = 60_000;

interface Deps {
  loader?: BriefLoader;
  now?: () => number;
}

interface CacheEntry {
  brief: GrowthBrief;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

export function scopeKey(scope: BriefScope): string {
  return `${scope.market}|${scope.locale}|${scope.channel}|${scope.topic ?? ''}`;
}

/** The native store: the active approved brief for a scope, a single Firestore read. */
export const ACTIVE_BRIEF_COLLECTION = 'growth_brief_active';

const firestoreLoader: BriefLoader = async (scope) => {
  if (!isAdminConfigured()) throw new Error('datastore unavailable');
  const snap = await getAdminDb().collection(ACTIVE_BRIEF_COLLECTION).doc(scopeKey(scope)).get();
  return snap.exists ? (snap.data() ?? null) : null;
};

export async function resolveEffectiveBrief(
  scope: BriefScope,
  deps: Deps = {}
): Promise<EffectiveBrief> {
  const loader = deps.loader ?? firestoreLoader;
  const nowFn = deps.now ?? Date.now;
  const nowMs = nowFn();

  const key = scopeKey(scope);
  const cached = cache.get(key);
  if (cached) {
    const withinCeiling = nowMs - cached.fetchedAt < CACHE_CEILING_MS;
    if (withinCeiling && isBriefFresh(cached.brief, nowMs)) {
      return { kind: 'brief', brief: cached.brief };
    }
    // Past the ceiling or past the brief's own expiry — never serve it again.
    cache.delete(key);
  }

  let raw: unknown | null;
  try {
    raw = await loader(scope);
  } catch {
    return { kind: 'baseline', reason: 'datastore_unavailable' };
  }

  if (raw === null || raw === undefined) return { kind: 'baseline', reason: 'no_active_brief' };

  const parsed = parseGrowthBrief(raw);
  if (!parsed.ok) return { kind: 'baseline', reason: 'invalid_brief' };
  if (!isBriefFresh(parsed.brief, nowMs)) return { kind: 'baseline', reason: 'stale_brief' };

  cache.set(key, { brief: parsed.brief, fetchedAt: nowMs });
  return { kind: 'brief', brief: parsed.brief };
}

/** Test-only: reset the in-process cache between cases. */
export function __clearBriefCache(): void {
  cache.clear();
}
