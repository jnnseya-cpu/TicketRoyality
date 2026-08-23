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

  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const possible = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((earned / possible) * 100);

  return {
    score,
    grade: score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 45 ? 'needs work' : 'poor',
    checks,
  };
}
