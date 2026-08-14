/**
 * Editorial content (docs/04 M25).
 *
 * Every article in this set is written, reviewed and committed by a person. That is
 * not a stylistic preference — Google's scaled content abuse policy targets
 * mass-generated pages, the penalty is site-wide rather than page-level, and it would
 * take down the programmatic event pages that are the actual SEO asset. Breadth is
 * fine; depth per page is what keeps it on the right side of that line. An article
 * here exists because it answers a question a real buyer or organiser asks.
 *
 * Three things are dynamic while the prose stays fixed:
 *   - `linkSlots` resolve against live inventory at render time, so a piece published
 *     in March still links to events on sale in June.
 *   - Inline links are generated from the phrase registry in `links.ts`.
 *   - Related articles are computed from clusters and tags, so adding an article
 *     wires it into the graph without editing the ones already published.
 */
import type { DestinationKey } from '@/shared/content/links';

export type ArticleKind = 'city_guide' | 'interview' | 'data' | 'guide' | 'feature';

/**
 * Topic clusters. Each is a hub page at `/blog/topics/<cluster>`, and every article
 * belongs to exactly one. This is the standard hub-and-spoke shape: it concentrates
 * authority on the hub, gives crawlers an obvious path to every leaf, and gives
 * readers a reason to read a second page.
 */
export type Cluster =
  | 'intelligence'
  | 'selling'
  | 'operations'
  | 'money'
  | 'trust'
  | 'platform'
  | 'buying';

export interface ClusterMeta {
  key: Cluster;
  title: string;
  /** The search intent this cluster serves. Used as the hub page's description. */
  intent: string;
  audience: 'organiser' | 'customer' | 'both';
}

export const CLUSTERS: ClusterMeta[] = [
  {
    key: 'intelligence',
    title: 'AI that does the work',
    intent:
      'What the AI actually builds, what it refuses to do on its own, and where a human still signs off.',
    audience: 'organiser',
  },
  {
    key: 'selling',
    title: 'Selling more tickets',
    intent:
      'Pricing, tiers, discounts, affiliates, sponsors and advertising — the levers that move sales.',
    audience: 'organiser',
  },
  {
    key: 'operations',
    title: 'Running the event',
    intent:
      'The door, the scanners, the zones and the things that go wrong on the night.',
    audience: 'organiser',
  },
  {
    key: 'money',
    title: 'Money, fees and payouts',
    intent:
      'What you are charged, when you are paid, and how money moves in every market we operate in.',
    audience: 'both',
  },
  {
    key: 'trust',
    title: 'Trust and safety',
    intent:
      'Fraud, bots, forged tickets, disputes and data protection — what is enforced and how.',
    audience: 'both',
  },
  {
    key: 'platform',
    title: 'The platform underneath',
    intent: 'APIs, webhooks, notifications and the integrations other systems hang off.',
    audience: 'organiser',
  },
  {
    key: 'buying',
    title: 'Buying and going',
    intent: 'Finding something worth going to, paying for it, and getting in.',
    audience: 'customer',
  },
];

export function clusterMeta(key: Cluster): ClusterMeta {
  const found = CLUSTERS.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown cluster: ${key}`);
  return found;
}

export interface ArticleBlock {
  type: 'paragraph' | 'heading' | 'list';
  text?: string;
  items?: string[];
}

export interface LinkSlot {
  heading: string;
  /** Matched case-insensitively against title, city, category and organiser. */
  query: string;
  href: string;
}

export interface Article {
  slug: string;
  title: string;
  kind: ArticleKind;
  cluster: Cluster;
  excerpt: string;
  published: string;
  updated: string;
  readMinutes: number;
  author: string;
  /**
   * Free-form topic tags. Two articles sharing a tag are related even across
   * clusters — "pricing" connects a money article to a selling one.
   */
  tags: string[];
  blocks: ArticleBlock[];
  linkSlots: LinkSlot[];
  /** The explicit call to action. Rendered as a card at the end of the piece. */
  productLinks?: DestinationKey[];
  /**
   * The question this article is written to answer, verbatim, in the words someone
   * would type. Rendered as FAQ structured data — the one schema type that still
   * reliably earns extra surface area in results.
   */
  answers?: { question: string; answer: string }[];
}

import { FEATURE_ARTICLES } from '@/shared/content/features';
import { EDITORIAL_ARTICLES } from '@/shared/content/editorial';

export const ARTICLES: Article[] = [...EDITORIAL_ARTICLES, ...FEATURE_ARTICLES];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function publishedArticles(): Article[] {
  return [...ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
}

export function articlesInCluster(cluster: Cluster): Article[] {
  return publishedArticles().filter((a) => a.cluster === cluster);
}

/**
 * Related articles, relevance-scored.
 *
 * Same cluster is worth more than a shared tag, because cluster membership is a
 * deliberate editorial decision and tags are cheap. Ties break on recency so the
 * block does not freeze into the same three links forever.
 */
export function relatedArticles(target: Article, limit = 4): Article[] {
  return publishedArticles()
    .filter((a) => a.slug !== target.slug)
    .map((a) => {
      let score = 0;
      if (a.cluster === target.cluster) score += 4;
      score += a.tags.filter((t) => target.tags.includes(t)).length * 2;
      if (a.kind === target.kind) score += 1;
      return { article: a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.article.published.localeCompare(a.article.published))
    .slice(0, limit)
    .map((x) => x.article);
}
