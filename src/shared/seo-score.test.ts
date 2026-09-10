/**
 * The listing SEO score. `npm run test:seo-score`
 *
 * The assertions that matter: a complete listing scores excellent, every named gap
 * costs its stated weight and produces actionable advice, and the boundaries (title
 * truncation, past dates, unlisted events) flip the right checks.
 */
import assert from 'node:assert/strict';

import { scoreArticle, scoreEventListing, type ArticleForSeo, type ListingForSeo } from './seo-score';

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

/* -------------------------------------------------------------------------- */
/* Article SEO score                                                          */
/* -------------------------------------------------------------------------- */

const body = (words: number) => ({ type: 'paragraph', text: 'word '.repeat(words).trim() });

const goodArticle = (over: Partial<ArticleForSeo> = {}): ArticleForSeo => ({
  title: 'How to sell out a club night in Kinshasa',
  excerpt: 'D'.repeat(140),
  blocks: [
    { type: 'heading', text: 'First' },
    body(400),
    { type: 'heading', text: 'Second' },
    body(300),
  ],
  answers: [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }],
  tags: ['pricing', 'nightlife', 'promotion'],
  linkSlots: [{ heading: 'Upcoming' }],
  cluster: 'selling',
  updated: '2026-08-01T00:00:00.000Z',
  ...over,
});

console.log('\nArticle SEO score\n');

test('a complete article is excellent (>=90)', () => {
  const r = scoreArticle(goodArticle(), NOW);
  assert.ok(r.score >= 90, `expected >=90, got ${r.score}`);
  assert.equal(r.grade, 'excellent');
});

test('no FAQ costs its weight and names the AI-search benefit', () => {
  const r = scoreArticle(goodArticle({ answers: [] }), NOW);
  const check = r.checks.find((c) => c.label === 'FAQ / answers');
  assert.equal(check?.ok, false);
  assert.match(check?.advice ?? '', /AI search|rich result/);
  assert.ok(r.score < 90);
});

test('thin content fails the depth check', () => {
  const r = scoreArticle(goodArticle({ blocks: [{ type: 'heading', text: 'H' }, body(50)] }), NOW);
  assert.equal(r.checks.find((c) => c.label === 'Depth')?.ok, false);
});

test('a 61-char title fails; an over-long excerpt fails', () => {
  const longTitle = scoreArticle(goodArticle({ title: 'x'.repeat(61) }), NOW);
  assert.equal(longTitle.checks.find((c) => c.label === 'Title length')?.ok, false);
  const longExcerpt = scoreArticle(goodArticle({ excerpt: 'x'.repeat(180) }), NOW);
  assert.equal(longExcerpt.checks.find((c) => c.label === 'Meta description')?.ok, false);
});

test('a stale article fails freshness', () => {
  const r = scoreArticle(goodArticle({ updated: '2024-01-01T00:00:00.000Z' }), NOW);
  assert.equal(r.checks.find((c) => c.label === 'Freshness')?.ok, false);
});

test('an empty article is poor, not crashing', () => {
  const r = scoreArticle({}, NOW);
  assert.equal(r.grade, 'poor');
  assert.ok(r.score < 45);
});

console.log(
  failures.length === 0
    ? `\n${passed} passed\n`
    : `\n${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}\n`
);
if (failures.length > 0) process.exit(1);
