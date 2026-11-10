/**
 * Effective-brief SDK tests. `npm run test:brief-sdk`
 *
 * The property that matters most: the resolver NEVER throws and NEVER returns a brief it
 * should not act on. Baseline on no engine, 204, transient error, bad payload and a
 * stale brief; a brief only when schema-valid and fresh; and caching bounded by the
 * 60-second ceiling and the brief's own expiry.
 */
import assert from 'node:assert/strict';

delete process.env.TREND_ENGINE_URL; // ensure the "not configured" case is honest

import { resolveEffectiveBrief, __clearBriefCache, type BriefScope } from './brief-sdk';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  __clearBriefCache();
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const NOW = Date.parse('2026-11-12T00:00:00Z');
const SCOPE: BriefScope = { market: 'CA', locale: 'en-CA', channel: 'seo', topic: 't1' };
const ENGINE = 'https://engine.example';

const freshBrief = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  brief_id: 'gb_1',
  brief_version: 1,
  tenant_id: 'tenant_demo',
  platform_id: 'fixture_platform_a',
  market: 'CA',
  locale: 'en-CA',
  topic_id: 't1',
  opportunity_score: 86.25,
  confidence: 83.5,
  valid_from: '2026-11-10T10:00:00Z',
  expires_at: '2026-11-17T10:00:00Z',
  evidence_ids: ['ev_1'],
  audience: 'small teams',
  intent: 'evaluate onboarding',
  approved_claim_ids: ['claim_1'],
  cta_id: 'cta_1',
  allowed_channels: ['seo', 'organic_social'],
  prohibited_claims: ['guaranteed onboarding time'],
  objective: 'qualified trial starts',
  experiment_id: 'exp_1',
  policy_version: 1,
  ...over,
});

/** A fake fetch that counts calls and returns a canned response. */
function fakeFetch(resp: { status: number; ok?: boolean; body?: unknown; throws?: boolean }) {
  const state = { calls: 0 };
  const impl = (async () => {
    state.calls += 1;
    if (resp.throws) throw new Error('network');
    return {
      status: resp.status,
      ok: resp.ok ?? (resp.status >= 200 && resp.status < 300),
      json: async () => resp.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, state };
}

async function run() {
console.log('\nEffective-brief SDK\n');

await test('no engine configured → baseline', async () => {
  const r = await resolveEffectiveBrief(SCOPE, { now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'engine_not_configured' });
});

await test('a fresh valid brief is returned', async () => {
  const f = fakeFetch({ status: 200, body: freshBrief() });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.equal(r.kind, 'brief');
});

await test('a second call within 60s is served from cache (one fetch)', async () => {
  const f = fakeFetch({ status: 200, body: freshBrief() });
  const deps = { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW };
  await resolveEffectiveBrief(SCOPE, deps);
  await resolveEffectiveBrief(SCOPE, deps);
  assert.equal(f.state.calls, 1);
});

await test('after the 60s ceiling it refetches', async () => {
  const f = fakeFetch({ status: 200, body: freshBrief() });
  let t = NOW;
  const deps = { engineUrl: ENGINE, fetchImpl: f.impl, now: () => t };
  await resolveEffectiveBrief(SCOPE, deps);
  t = NOW + 61_000;
  await resolveEffectiveBrief(SCOPE, deps);
  assert.equal(f.state.calls, 2);
});

await test('204 → baseline (no eligible brief)', async () => {
  const f = fakeFetch({ status: 204 });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'no_eligible_brief' });
});

await test('an expired brief → baseline (never served)', async () => {
  const f = fakeFetch({
    status: 200,
    body: freshBrief({ valid_from: '2026-11-01T00:00:00Z', expires_at: '2026-11-08T00:00:00Z' }),
  });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'stale_brief' });
});

await test('an invalid payload → baseline', async () => {
  const f = fakeFetch({ status: 200, body: { schema_version: 1, bogus: true } });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'invalid_brief' });
});

await test('a network failure/timeout → baseline, no throw', async () => {
  const f = fakeFetch({ status: 0, throws: true });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'engine_unavailable' });
});

await test('a 503 → baseline (engine unavailable)', async () => {
  const f = fakeFetch({ status: 503 });
  const r = await resolveEffectiveBrief(SCOPE, { engineUrl: ENGINE, fetchImpl: f.impl, now: () => NOW });
  assert.deepEqual(r, { kind: 'baseline', reason: 'engine_unavailable' });
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
}

void run();
