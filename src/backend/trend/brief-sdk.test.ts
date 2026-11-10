/**
 * Effective-brief resolver tests (native). `npm run test:brief-sdk`
 *
 * The property that matters most: the resolver NEVER throws and NEVER returns a brief it
 * should not act on. Baseline on no active brief, datastore error, bad payload and a stale
 * brief; a brief only when schema-valid and fresh; caching bounded by the 60-second
 * ceiling and the brief's own expiry. The store is injected, so this is deterministic.
 */
import assert from 'node:assert/strict';

import {
  resolveEffectiveBrief,
  __clearBriefCache,
  type BriefScope,
  type BriefLoader,
} from './brief-sdk';

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

/** A fake native store that counts loads and returns a canned brief (or null / throws). */
function fakeLoader(result: unknown | null | 'throw') {
  const state = { calls: 0 };
  const loader: BriefLoader = async () => {
    state.calls += 1;
    if (result === 'throw') throw new Error('datastore');
    return result;
  };
  return { loader, state };
}

async function run() {
  console.log('\nEffective-brief resolver (native)\n');

  await test('no active brief → baseline', async () => {
    const f = fakeLoader(null);
    const r = await resolveEffectiveBrief(SCOPE, { loader: f.loader, now: () => NOW });
    assert.deepEqual(r, { kind: 'baseline', reason: 'no_active_brief' });
  });

  await test('a fresh valid brief is returned', async () => {
    const f = fakeLoader(freshBrief());
    const r = await resolveEffectiveBrief(SCOPE, { loader: f.loader, now: () => NOW });
    assert.equal(r.kind, 'brief');
  });

  await test('a second call within 60s is served from cache (one load)', async () => {
    const f = fakeLoader(freshBrief());
    const deps = { loader: f.loader, now: () => NOW };
    await resolveEffectiveBrief(SCOPE, deps);
    await resolveEffectiveBrief(SCOPE, deps);
    assert.equal(f.state.calls, 1);
  });

  await test('after the 60s ceiling it reloads', async () => {
    const f = fakeLoader(freshBrief());
    let t = NOW;
    const deps = { loader: f.loader, now: () => t };
    await resolveEffectiveBrief(SCOPE, deps);
    t = NOW + 61_000;
    await resolveEffectiveBrief(SCOPE, deps);
    assert.equal(f.state.calls, 2);
  });

  await test('an expired brief → baseline (never served)', async () => {
    const f = fakeLoader(
      freshBrief({ valid_from: '2026-11-01T00:00:00Z', expires_at: '2026-11-08T00:00:00Z' })
    );
    const r = await resolveEffectiveBrief(SCOPE, { loader: f.loader, now: () => NOW });
    assert.deepEqual(r, { kind: 'baseline', reason: 'stale_brief' });
  });

  await test('an invalid stored payload → baseline', async () => {
    const f = fakeLoader({ schema_version: 1, bogus: true });
    const r = await resolveEffectiveBrief(SCOPE, { loader: f.loader, now: () => NOW });
    assert.deepEqual(r, { kind: 'baseline', reason: 'invalid_brief' });
  });

  await test('a datastore failure → baseline, no throw', async () => {
    const f = fakeLoader('throw');
    const r = await resolveEffectiveBrief(SCOPE, { loader: f.loader, now: () => NOW });
    assert.deepEqual(r, { kind: 'baseline', reason: 'datastore_unavailable' });
  });

  console.log(
    failures.length === 0
      ? `\n${passed} passed\n`
      : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
  );
  if (failures.length > 0) process.exit(1);
}

void run();
