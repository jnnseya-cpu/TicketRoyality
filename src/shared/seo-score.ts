/**
 * The listing SEO score — how well one event page will perform in search.
 *
 * Every check maps to something that genuinely moves ranking or rich-result
 * eligibility for an event page (docs/04 M25 "Technical SEO"): the `Event` JSON-LD
 * carousel needs a date, a venue and an offer; titles are truncated by Google around
 * 60 characters; a description under a couple of sentences produces a weak snippet;
 * a page without an image never earns the thumbnail. Nothing here is a vanity
 * metric — each failing check names the fix in the organiser's own terms.
 *
 * Pure and shared so the editor scores WHILE the organiser types, and anything
 * server-side can score the same way without drift.
 */

export interface SeoCheck {
  label: string;
  ok: boolean;
  /** What to do about it, shown only when failing. */
  advice: string;
  /** Points this check contributes to the 100. */
  weight: number;
}

export interface SeoScoreResult {
  /** 0–100. */
  score: number;
  grade: 'excellent' | 'good' | 'needs work' | 'poor';
  checks: SeoCheck[];
}

export interface ListingForSeo {
  title?: string;
  description?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  category?: string;
  location?: string;
  hasCoordinates?: boolean;
  date?: string;
  /** At least one tier with a price or an explicit free tier. */
  hasTiers?: boolean;
  /** 'public' | 'unlisted' */
  listing?: string;
}

export function scoreEventListing(input: ListingForSeo, now = new Date()): SeoScoreResult {
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();

  const checks: SeoCheck[] = [
    {
      label: 'Title length',
      ok: title.length >= 10 && title.length <= 60,
      advice:
        title.length < 10
          ? 'Give the event a fuller title — at least 10 characters, ideally naming what and where.'
          : 'Keep the title at 60 characters or fewer — Google truncates longer ones mid-word.',
      weight: 15,
    },
    {
      label: 'Description depth',
      ok: description.length >= 200,
      advice:
        'Write at least a solid paragraph (200+ characters). The first two sentences become the search snippet.',
      weight: 15,
    },
    {
      label: 'Event picture',
      ok: Boolean(input.imageUrl?.trim()),
      advice: 'Upload an event picture — results with an image earn the thumbnail; bare ones do not.',
      weight: 12,
    },
    {
      label: 'Category',
      ok: Boolean(input.category?.trim()),
      advice: 'Pick a category — it places the event on the browse and category pages that rank.',
      weight: 8,
    },
    {
      label: 'Venue named',
      ok: Boolean(input.location?.trim()),
      advice: 'Name the venue — the events rich result requires a place, not just a city.',
      weight: 15,
    },
    {
      label: 'Map coordinates',
      ok: Boolean(input.hasCoordinates),
      advice:
        'Set the location on the map (the address lookup fills it) — geo data feeds "near me" queries.',
      weight: 10,
    },
    {
      label: 'Future date',
      ok: Boolean(input.date) && new Date(input.date ?? 0).getTime() > now.getTime(),
      advice: 'The date must be in the future — Google drops past events from the carousel.',
      weight: 10,
    },
    {
      label: 'Tickets configured',
      ok: Boolean(input.hasTiers),
      advice:
        'Add at least one ticket type — the price and availability are what the rich result displays.',
      weight: 10,
    },
    {
      label: 'Publicly listed',
      ok: (input.listing ?? 'public') !== 'unlisted',
      advice: 'This event is link-only, so search engines are told not to index it at all.',
      weight: 5,
    },
  ];

  return tally(checks);
}

/* -------------------------------------------------------------------------- */
/* Blog article SEO — the same idea, for a `/blog/<slug>` page.               */
/* -------------------------------------------------------------------------- */

/**
 * A blog article scored on the factors that actually move ranking and — increasingly —
 * whether a generative engine (Google AI Overviews, Perplexity, ChatGPT search) will
 * quote the page as an answer. Each check is a real lever, not a vanity metric:
 *
 * - title ≤60 chars so Google does not truncate it mid-word;
 * - a meta description in the 120–160 band so the snippet is full but not cut;
 * - **question headings + an FAQ**, which is what an AI engine extracts as an answer and
 *   what earns the FAQ rich result;
 * - enough depth (word count) that the page is not thin content;
 * - internal links, so crawlers reach the cluster hub and the live inventory;
 * - freshness, because a stale `dateModified` is a ranking drag on evergreen topics.
 *
 * Pure and shared, so the drafting agent can target ≥90 and an editor can see the same
 * score without the two drifting apart.
 */
export interface ArticleForSeo {
  title?: string;
  /** The meta description / excerpt. */
  excerpt?: string;
  blocks?: Array<{ type: string; text?: string; items?: string[] }>;
  /** FAQ entries — drive the FAQPage rich result and AI answer extraction. */
  answers?: Array<unknown>;
  tags?: string[];
  /** Dynamic link slots that resolve against live inventory at render time. */
  linkSlots?: Array<unknown>;
  cluster?: string;
  /** ISO date last updated — freshness. */
  updated?: string;
}

/** Words across paragraph and list copy — the body a reader and a crawler actually see. */
function articleWordCount(blocks: ArticleForSeo['blocks']): number {
  if (!blocks) return 0;
  let words = 0;
  for (const b of blocks) {
    if (b.text) words += b.text.trim().split(/\s+/).filter(Boolean).length;
    if (b.items) for (const item of b.items) words += item.trim().split(/\s+/).filter(Boolean).length;
  }
  return words;
}

export function scoreArticle(input: ArticleForSeo, now = new Date()): SeoScoreResult {
  const title = (input.title ?? '').trim();
  const excerpt = (input.excerpt ?? '').trim();
  const headingCount = (input.blocks ?? []).filter((b) => b.type === 'heading').length;
  const wordCount = articleWordCount(input.blocks);
  const faqCount = input.answers?.length ?? 0;
  const tagCount = input.tags?.length ?? 0;
  const linkCount = input.linkSlots?.length ?? 0;
  const updatedMs = input.updated ? new Date(input.updated).getTime() : 0;
  const freshWithinYear = updatedMs > 0 && now.getTime() - updatedMs <= 366 * 24 * 60 * 60 * 1000;

  const checks: SeoCheck[] = [
    {
      label: 'Title length',
      ok: title.length >= 15 && title.length <= 60,
      advice:
        title.length < 15
          ? 'Give the article a fuller title (15+ characters) that states the question it answers.'
          : 'Trim the title to 60 characters or fewer — Google cuts longer ones off mid-word.',
      weight: 15,
    },
    {
      label: 'Meta description',
      ok: excerpt.length >= 120 && excerpt.length <= 160,
      advice:
        excerpt.length < 120
          ? 'Write a 120–160 character excerpt — it becomes the search snippet and the social card.'
          : 'Shorten the excerpt to 160 characters — Google truncates the snippet past that.',
      weight: 12,
    },
    {
      label: 'Section headings',
      ok: headingCount >= 2,
      advice: 'Break the piece into at least two H2 sections — crawlers and AI engines read the structure.',
      weight: 12,
    },
    {
      label: 'Depth',
      ok: wordCount >= 600,
      advice: 'Aim for 600+ words. Thin content is the most common reason an article never ranks.',
      weight: 15,
    },
    {
      label: 'FAQ / answers',
      ok: faqCount >= 2,
      advice:
        'Add at least two question-and-answer pairs — they earn the FAQ rich result and are what AI search quotes.',
      weight: 14,
    },
    {
      label: 'Internal links',
      ok: linkCount >= 1,
      advice:
        'Add at least one dynamic link block (events, organisers or related topics) so the page links out to live inventory.',
      weight: 10,
    },
    {
      label: 'Topic tags',
      ok: tagCount >= 3,
      advice: 'Tag the article with 3+ topics — tags wire it into the related-article graph and the cluster hub.',
      weight: 10,
    },
    {
      label: 'Freshness',
      ok: freshWithinYear,
      advice: 'Update the article within the year — a stale modified date drags evergreen pieces down.',
      weight: 7,
    },
    {
      label: 'In a topic cluster',
      ok: Boolean(input.cluster?.trim()),
      advice: 'Assign a cluster so the article sits under a hub page and shares its authority.',
      weight: 5,
    },
  ];

  return tally(checks);
}

/** Shared scoring: earned ÷ possible, rounded, graded. */
function tally(checks: SeoCheck[]): SeoScoreResult {
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const possible = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((earned / possible) * 100);

  return {
    score,
    grade: score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 45 ? 'needs work' : 'poor',
    checks,
  };
}
