/**
 * Reports how densely the inline link registry actually fires across the article set.
 *
 * The registry is only useful if its phrases appear in the prose. A phrase that never
 * matches is dead configuration, and an article that matches nothing is a page with no
 * outbound context at all — which is precisely the page a crawler treats as a dead end.
 *
 * Run with `npm run report:links` after adding articles or phrases.
 */
import { publishedArticles, publishedSlugs } from '../src/shared/content/articles';
import { LINK_TERMS, linkify, newLinkState } from '../src/shared/content/links';

/** Article prose, headings excluded — the same text `linkify` is given at render. */
function proseOf(article: ReturnType<typeof publishedArticles>[number]): string[] {
  const runs: string[] = [];
  for (const block of article.blocks) {
    if (block.type === 'heading') continue;
    if (block.type === 'list') runs.push(...(block.items ?? []));
    else if (block.text) runs.push(block.text);
  }
  // The rendered page linkifies the FAQ answers too, after the body.
  for (const qa of article.answers ?? []) runs.push(qa.answer);
  return runs;
}

const phraseHits = new Map<string, number>();
for (const term of LINK_TERMS) for (const phrase of term.phrases) phraseHits.set(phrase, 0);

const perArticle: { slug: string; count: number }[] = [];

const ARTICLES = publishedArticles();
const SLUGS = publishedSlugs();

for (const article of ARTICLES) {
  const state = newLinkState(`/blog/${article.slug}`, SLUGS);
  for (const run of proseOf(article)) linkify(run, state);
  perArticle.push({ slug: article.slug, count: state.count });

  const text = proseOf(article).join(' ');
  for (const term of LINK_TERMS) {
    for (const phrase of term.phrases) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
        phraseHits.set(phrase, (phraseHits.get(phrase) ?? 0) + 1);
      }
    }
  }
}

perArticle.sort((a, b) => a.count - b.count);

console.log('Inline links per article (lowest first):\n');
for (const row of perArticle) {
  console.log(`  ${String(row.count).padStart(2)} ${'█'.repeat(row.count).padEnd(10)} ${row.slug}`);
}

const total = perArticle.reduce((sum, r) => sum + r.count, 0);
console.log(
  `\n  total ${total} inline links, mean ${(total / perArticle.length).toFixed(1)} per article`
);

const dead = [...phraseHits.entries()].filter(([, hits]) => hits === 0).map(([p]) => p);
if (dead.length > 0) {
  console.log(`\nPhrases that never appear in any prose (${dead.length}):`);
  for (const phrase of dead) console.log(`  - "${phrase}"`);
}

const starved = perArticle.filter((r) => r.count < 2).map((r) => r.slug);
if (starved.length > 0) {
  console.log(`\nArticles with fewer than 2 inline links (${starved.length}):`);
  for (const slug of starved) console.log(`  - ${slug}`);
} else {
  console.log('\n✓ every article carries at least 2 inline links');
}
