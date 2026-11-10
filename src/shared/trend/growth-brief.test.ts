/**
 * Growth Brief v1 contract tests. `npm run test:growth-brief`
 *
 * Pins the host-side mirror of the engine contract: the §6 canonical fixture validates,
 * the closed object rejects unknown fields, and the runtime rules (ISO market, UTC Z
 * timestamps, valid_from < expires_at, freshness window) behave as the spec requires.
 */
import assert from 'node:assert/strict';

import { parseGrowthBrief, isBriefFresh, type GrowthBrief } from './growth-brief';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

// The §6 canonical positive fixture.
const FIXTURE = {
  schema_version: 1,
  brief_id: 'gb_104',
  brief_version: 3,
  tenant_id: 'tenant_demo',
  platform_id: 'fixture_platform_a',
  market: 'CA',
  locale: 'en-CA',
  topic_id: 'simpler-team-onboarding',
  opportunity_score: 86.25,
  confidence: 83.5,
  valid_from: '2026-11-10T10:00:00Z',
  expires_at: '2026-11-17T10:00:00Z',
  evidence_ids: ['ev_341', 'ev_342'],
  audience: 'Small teams comparing onboarding options',
  intent: 'evaluate how to onboard a small team',
  approved_claim_ids: ['claim_onboarding_01'],
  cta_id: 'cta_view_onboarding_guide',
  allowed_channels: ['seo', 'organic_social'],
  prohibited_claims: ['guaranteed onboarding time', 'unsupported third-party endorsements'],
  objective: 'qualified trial starts per eligible session',
  experiment_id: 'exp_91',
  policy_version: 5,
};

console.log('\nGrowth Brief v1 contract\n');

test('the §6 canonical fixture validates', () => {
  const r = parseGrowthBrief(FIXTURE);
  assert.equal(r.ok, true, r.ok ? '' : r.error);
});

test('unknown fields are rejected (closed object)', () => {
  const r = parseGrowthBrief({ ...FIXTURE, sneaky: 'x' });
  assert.equal(r.ok, false);
});

test('a non-ISO market is rejected', () => {
  assert.equal(parseGrowthBrief({ ...FIXTURE, market: 'CAN' }).ok, false);
});

test('a non-UTC timestamp (offset, not Z) is rejected', () => {
  assert.equal(parseGrowthBrief({ ...FIXTURE, valid_from: '2026-11-10T10:00:00+01:00' }).ok, false);
});

test('expires_at before valid_from is rejected', () => {
  assert.equal(
    parseGrowthBrief({ ...FIXTURE, valid_from: '2026-11-17T10:00:00Z', expires_at: '2026-11-10T10:00:00Z' }).ok,
    false
  );
});

test('empty evidence_ids is rejected (minItems 1)', () => {
  assert.equal(parseGrowthBrief({ ...FIXTURE, evidence_ids: [] }).ok, false);
});

test('a duplicate allowed_channel is rejected (uniqueItems)', () => {
  assert.equal(parseGrowthBrief({ ...FIXTURE, allowed_channels: ['seo', 'seo'] }).ok, false);
});

test('an out-of-range score is rejected', () => {
  assert.equal(parseGrowthBrief({ ...FIXTURE, opportunity_score: 120 }).ok, false);
});

test('freshness: inside the window is fresh, outside is not', () => {
  const brief = (parseGrowthBrief(FIXTURE) as { ok: true; brief: GrowthBrief }).brief;
  const inside = Date.parse('2026-11-12T00:00:00Z');
  const before = Date.parse('2026-11-09T00:00:00Z');
  const after = Date.parse('2026-11-18T00:00:00Z');
  assert.equal(isBriefFresh(brief, inside), true);
  assert.equal(isBriefFresh(brief, before), false, 'before valid_from is not fresh');
  assert.equal(isBriefFresh(brief, after), false, 'after expires_at is not fresh');
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
