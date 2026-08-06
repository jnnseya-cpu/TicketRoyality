import type { Event } from '@/shared/types';

/**
 * Dynamic internal linking (docs/04 M25).
 *
 * This is site architecture, not link building: it distributes authority, helps
 * crawlers reach deep pages, and helps humans find the next thing. Every link is
 * relevance-scored rather than random, because a "related" block full of unrelated
 * events teaches visitors to ignore it and teaches crawlers nothing.
 */
export interface RelatedGroup {
  heading: string;
  href: string;
  events: Event[];
}

/** Higher is closer. Deliberately simple and deterministic — no model in this path. */
function score(target: Event, candidate: Event): number {
  let s = 0;
  if (candidate.organizerId === target.organizerId) s += 5;
  if (candidate.category === target.category) s += 4;
  if (candidate.categoryGroup === target.categoryGroup) s += 2;
  if (candidate.location === target.location) s += 3;
  if (candidate.country === target.country) s += 1;
  if (candidate.eventType === target.eventType) s += 1;

  // Prefer events happening soon after this one: someone browsing a March gig is more
  // likely to buy for April than for next December.
  const days = Math.abs(
    (new Date(candidate.date).getTime() - new Date(target.date).getTime()) / 86_400_000
  );
  if (days <= 30) s += 3;
  else if (days <= 90) s += 1;

  return s;
}

const MAX_LINKS = 8; // docs/04 M25 — bounded on purpose

export function relatedTo(target: Event, all: Event[], limit = 6): Event[] {
  const now = Date.now();
  return all
    .filter(
      (e) =>
        e.id !== target.id &&
        e.status === 'published' &&
        new Date(e.date).getTime() >= now // never link to an expired event
    )
    .map((e) => ({ event: e, s: score(target, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.event.date.localeCompare(b.event.date))
    .slice(0, Math.min(limit, MAX_LINKS))
    .map((x) => x.event);
}

/** Grouped links, each with a destination page so the block is also navigation. */
export function relatedGroups(target: Event, all: Event[]): RelatedGroup[] {
  const now = Date.now();
  const live = all.filter(
    (e) => e.id !== target.id && e.status === 'published' && new Date(e.date).getTime() >= now
  );

  const groups: RelatedGroup[] = [
    {
      heading: `More from ${target.organizerName}`,
      href: `/organisers/${target.organizerId}`,
      events: live.filter((e) => e.organizerId === target.organizerId).slice(0, 3),
    },
    {
      heading: `More ${target.category}`,
      href: `/events?category=${encodeURIComponent(target.category)}`,
      events: live.filter((e) => e.category === target.category).slice(0, 3),
    },
    {
      heading: `What else is on in ${target.location}`,
      href: `/events?q=${encodeURIComponent(target.location)}`,
      events: live.filter((e) => e.location === target.location).slice(0, 3),
    },
  ];

  return groups.filter((g) => g.events.length > 0);
}
