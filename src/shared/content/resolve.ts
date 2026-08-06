import type { Event } from '@/shared/types';
import type { LinkSlot } from '@/shared/content/articles';

/**
 * Resolves an article's link slots against live inventory.
 *
 * An empty query matches anything upcoming, which is how a slot like "organisers doing
 * this well" stays populated. Past events are excluded everywhere — an article linking
 * to a dead page is worse for a reader than an article with no links.
 */
export function resolveSlot(slot: LinkSlot, events: Event[], limit = 4): Event[] {
  const now = Date.now();
  const q = slot.query.trim().toLowerCase();

  const live = events.filter(
    (e) => e.status === 'published' && new Date(e.date).getTime() >= now
  );

  const matched = q
    ? live.filter((e) => {
        if (q === 'free') return e.ticketTiers.some((t) => t.price === 0);
        const haystack = [
          e.title,
          e.location,
          e.country,
          e.category,
          e.categoryGroup,
          e.organizerName,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
    : live;

  return matched
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
