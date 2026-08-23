/**
 * The listing SEO score. `npm run test:seo-score`
 *
 * The assertions that matter: a complete listing scores excellent, every named gap
 * costs its stated weight and produces actionable advice, and the boundaries (title
 * truncation, past dates, unlisted events) flip the right checks.
 */
import assert from 'node:assert/strict';

import { scoreEventListing, type ListingForSeo } from './seo-score';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const NOW = new Date('2026-08-20T12:00:00.000Z');

const complete = (over: Partial<ListingForSeo> = {}): ListingForSeo => ({
  title: 'Kinshasa Jazz Night at the Grand Hall',
  description: 'D'.repeat(240),
  imageUrl: 'https://firebasestorage.googleapis.com/x.jpg',
  category: 'Music',
  location: 'Grand Hall, Kinshasa',
  hasCoordinates: true,
  date: '2026-09-01T19:00:00.000Z',
  hasTiers: true,
  listing: 'public',
  ...over,
});

console.log('\nSEO score\n');

test('a complete listing is excellent', () => {
  const result = scoreEventListing(complete(), NOW);
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'excellent');
  assert.ok(result.checks.every((c) => c.ok));
});

test('a 61-character title fails; 60 passes', () => {
  const long = scoreEventListing(complete({ title: 'x'.repeat(61) }), NOW);
  assert.equal(long.checks.find((c) => c.label === 'Title length')?.ok, false);
  const exact = scoreEventListing(complete({ title: 'x'.repeat(60) }), NOW);
  assert.equal(exact.checks.find((c) => c.label === 'Title length')?.ok, true);
});

test('a thin description costs 15 points and says what to write', () => {
  const result = scoreEventListing(complete({ description: 'Come!' }), NOW);
  assert.equal(result.score, 85);
  const check = result.checks.find((c) => c.label === 'Description depth');
  assert.equal(check?.ok, false);
  assert.match(check?.advice ?? '', /snippet/);
});

test('a past date fails the carousel check', () => {
  const result = scoreEventListing(complete({ date: '2026-01-01T00:00:00.000Z' }), NOW);
  assert.equal(result.checks.find((c) => c.label === 'Future date')?.ok, false);
});

test('an unlisted event is told it is not indexable', () => {
  const result = scoreEventListing(complete({ listing: 'unlisted' }), NOW);
  const check = result.checks.find((c) => c.label === 'Publicly listed');
  assert.equal(check?.ok, false);
  assert.match(check?.advice ?? '', /not to index/);
});

test('an empty listing is poor, not crashing', () => {
  const result = scoreEventListing({}, NOW);
  assert.equal(result.grade, 'poor');
  assert.ok(result.score < 45);
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
