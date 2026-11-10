import 'server-only';

import { parseGrowthBrief, isBriefFresh, type GrowthBrief } from '@/shared/trend/growth-brief';

/**
 * Effective-brief SDK (external spec §4, §14 step 5).
 *
 * The one function the host's existing agents call before they draft: "resolve the
 * effective brief for this market, locale, channel and topic". Its defining property is
 * that it **fails safe to the host's baseline behaviour** — on no configured engine, no
 * eligible brief, a transient error, an invalid payload or a stale brief, it returns
 * `baseline`, never an exception and never a half-resolved brief. A brief is applied only
 * when it is schema-valid AND inside its freshness window.
 *
 * Caching is bounded exactly as the spec requires: within a 60-second ceiling and
 * **never beyond the brief's own expiry**. The cache is a per-instance convenience; it is
 * never the authority to write or publish, and nothing here grants an agent new scope.
 *
 * Dormant by default: with no `TREND_ENGINE_URL` configured, every call returns baseline,
 * so the platform behaves exactly as it does today until an engine is wired in.
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
  | 'engine_not_configured'
  | 'no_eligible_brief'
  | 'engine_unavailable'
  | 'invalid_brief'
  | 'stale_brief';

export type EffectiveBrief =
  | { kind: 'brief'; brief: GrowthBrief }
  | { kind: 'baseline'; reason: BaselineReason };

/** §14: cache within a 60-second ceiling. */
const CACHE_CEILING_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 2_000;

interface Deps {
  engineUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface CacheEntry {
  brief: GrowthBrief;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

export function isTrendEngineConfigured(): boolean {
  return Boolean(process.env.TREND_ENGINE_URL);
}

function scopeKey(scope: BriefScope): string {
  return `${scope.market}|${scope.locale}|${scope.channel}|${scope.topic ?? ''}`;
}

export async function resolveEffectiveBrief(
  scope: BriefScope,
  deps: Deps = {}
): Promise<EffectiveBrief> {
  const engineUrl = deps.engineUrl ?? process.env.TREND_ENGINE_URL;
  const token = deps.token ?? process.env.TREND_ENGINE_TOKEN;
  const nowFn = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowMs = nowFn();

  // Dormant / not wired: the platform's own baseline behaviour.
  if (!engineUrl) return { kind: 'baseline', reason: 'engine_not_configured' };

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

  const url = new URL(`${engineUrl.replace(/\/$/, '')}/v1/briefs:effective`);
  url.searchParams.set('market', scope.market);
  url.searchParams.set('locale', scope.locale);
  url.searchParams.set('channel', scope.channel);
  if (scope.topic) url.searchParams.set('topic', scope.topic);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
  } catch {
    // Timeout, abort, network failure — baseline, never throw.
    return { kind: 'baseline', reason: 'engine_unavailable' };
  } finally {
    clearTimeout(timer);
  }

  // §16: 204 means no eligible brief for this scope.
  if (response.status === 204) return { kind: 'baseline', reason: 'no_eligible_brief' };
  if (!response.ok) return { kind: 'baseline', reason: 'engine_unavailable' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'baseline', reason: 'invalid_brief' };
  }

  const parsed = parseGrowthBrief(body);
  if (!parsed.ok) return { kind: 'baseline', reason: 'invalid_brief' };
  if (!isBriefFresh(parsed.brief, nowMs)) return { kind: 'baseline', reason: 'stale_brief' };

  cache.set(key, { brief: parsed.brief, fetchedAt: nowMs });
  return { kind: 'brief', brief: parsed.brief };
}

/** Test-only: reset the in-process cache between cases. */
export function __clearBriefCache(): void {
  cache.clear();
}
