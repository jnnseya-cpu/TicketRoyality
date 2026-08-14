/**
 * Validates the internal link graph before it ships.
 *
 * Every link in an article is generated from a registry, which means one wrong entry
 * produces a broken link on every page that mentions the phrase. That is the failure
 * this catches: a 404 that appears thirty times rather than once, in the exact place a
 * crawler is being asked to follow it.
 *
 * Run with `npm run check:links`. No test framework — this needs to run in CI and in a
 * pre-deploy check, and adding a runner to assert twelve invariants is not a trade
 * worth making.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ARTICLES, CLUSTERS } from '../src/shared/content/articles';
import { DESTINATIONS, LINK_TERMS, hrefFor } from '../src/shared/content/links';

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

/** Every `page.tsx` under src/app, as a route path. Dynamic segments kept as `[x]`. */
function routes(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // Route groups `(name)` do not appear in the URL.
      const segment = entry.startsWith('(') ? '' : `/${entry}`;
      found.push(...routes(path, prefix + segment));
    } else if (entry === 'page.tsx') {
      found.push(prefix || '/');
    }
  }
  return found;
}

const REAL_ROUTES = new Set(routes('src/app'));
const SLUGS = new Set(ARTICLES.map((a) => a.slug));

/** `/events?q=London` is `/events` as far as route existence goes. */
function pathOf(href: string): string {
  return href.split('?')[0].split('#')[0];
}

function routeExists(href: string): boolean {
  const path = pathOf(href);
  if (REAL_ROUTES.has(path)) return true;

  // Dynamic routes: `/blog/x` satisfies `/blog/[slug]`.
  return [...REAL_ROUTES].some((route) => {
    const routeParts = route.split('/');
    const pathParts = path.split('/');
    if (routeParts.length !== pathParts.length) return false;
    return routeParts.every((part, i) => part.startsWith('[') || part === pathParts[i]);
  });
}

// 1. Every destination points at a route that exists.
for (const [key, destination] of Object.entries(DESTINATIONS)) {
  if (!routeExists(destination.href)) {
    fail(`DESTINATIONS.${key} → ${destination.href} is not a route`);
  }
}

// 2. Every link term resolves, and article targets name an article that exists.
for (const term of LINK_TERMS) {
  if (term.to.startsWith('article:')) {
    const slug = term.to.slice('article:'.length);
    if (!SLUGS.has(slug)) {
      fail(`LINK_TERMS [${term.phrases[0]}] → article:${slug} does not exist`);
    }
  } else if (!routeExists(hrefFor(term.to))) {
    fail(`LINK_TERMS [${term.phrases[0]}] → ${hrefFor(term.to)} is not a route`);
  }

  if (term.phrases.length === 0) fail(`LINK_TERMS entry for ${term.to} has no phrases`);
}

// 3. No duplicate phrases anywhere in the registry. A repeat is dead configuration:
//    the first match wins, so the second entry silently never fires — and if the two
//    point at different articles, the loser is a link you believe you have and do not.
const seenPhrases = new Map<string, string>();
for (const term of LINK_TERMS) {
  for (const raw of term.phrases) {
    const phrase = raw.toLowerCase();
    const owner = seenPhrases.get(phrase);
    if (owner) fail(`Phrase "${raw}" is claimed by both ${owner} and ${term.to}`);
    seenPhrases.set(phrase, term.to);
  }
}

// 4. Article invariants.
const seenSlugs = new Set<string>();
for (const article of ARTICLES) {
  if (seenSlugs.has(article.slug)) fail(`Duplicate article slug: ${article.slug}`);
  seenSlugs.add(article.slug);

  if (!CLUSTERS.some((c) => c.key === article.cluster)) {
    fail(`${article.slug} is in unknown cluster "${article.cluster}"`);
  }

  for (const key of article.productLinks ?? []) {
    if (!(key in DESTINATIONS)) fail(`${article.slug} productLinks → unknown "${key}"`);
  }

  for (const slot of article.linkSlots) {
    if (!routeExists(slot.href)) fail(`${article.slug} linkSlot → ${slot.href} is not a route`);
  }

  if (article.tags.length === 0) fail(`${article.slug} has no tags — it will not relate to anything`);

  // An excerpt is the search-result description. Google truncates around 160
  // characters, and an empty one means the engine invents its own from the body.
  if (article.excerpt.length < 40 || article.excerpt.length > 200) {
    fail(`${article.slug} excerpt is ${article.excerpt.length} chars (want 40–200)`);
  }

  if (new Date(article.updated) < new Date(article.published)) {
    fail(`${article.slug} was updated before it was published`);
  }
}

// 5. Every cluster has at least one article, or its hub page is an empty room that
//    the sitemap would otherwise advertise.
for (const cluster of CLUSTERS) {
  if (!ARTICLES.some((a) => a.cluster === cluster.key)) {
    fail(`Cluster "${cluster.key}" has no articles but has a hub page`);
  }
}

// 6. Orphan check: every article must be reachable from an inline link somewhere, or
//    it depends entirely on the hub for its internal links.
const linkedSlugs = new Set(
  LINK_TERMS.filter((t) => t.to.startsWith('article:')).map((t) => t.to.slice('article:'.length))
);
const orphans = ARTICLES.filter((a) => !linkedSlugs.has(a.slug)).map((a) => a.slug);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} link graph problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const phraseCount = LINK_TERMS.reduce((sum, t) => sum + t.phrases.length, 0);
console.log(
  `✓ ${ARTICLES.length} articles, ${CLUSTERS.length} clusters, ${LINK_TERMS.length} targets, ${phraseCount} phrases`
);
console.log(`✓ every destination, link term and slot resolves to a real route`);
if (orphans.length > 0) {
  // A warning, not a failure. Hub links are real links; this just flags articles that
  // no piece of prose points at, which is usually an oversight in the term registry.
  console.log(`\n  note: ${orphans.length} article(s) reachable only via hub and related blocks:`);
  for (const slug of orphans) console.log(`    - ${slug}`);
}
