import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { RelatedGroup } from '@/shared/related';
import { formatEventDate } from '@/shared/utils';
import { leadPrice } from '@/shared/pricing';

/**
 * Contextual internal links, rendered as real navigation rather than an SEO widget.
 *
 * Anchor text varies naturally per link — repeated exact-match anchors across a site
 * read as manipulation and help nobody. Every href points at a live page; expired
 * events are filtered upstream in `relatedTo`.
 */
export function RelatedLinks({ groups }: { groups: RelatedGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className="border-t border-border pt-10">
      <h2 id="related-heading" className="font-headline text-2xl font-bold">
        Where to next
      </h2>

      <div className="mt-6 grid gap-8 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.heading}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </h3>
            <ul className="mt-3 space-y-3">
              {group.events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className="group block rounded-md p-2 transition-colors hover:bg-card"
                  >
                    <span className="block font-medium leading-snug group-hover:text-primary">
                      {event.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatEventDate(event.date)} · {event.location} · from{' '}
                      {event.currency === 'GBP' ? '£' : ''}
                      {leadPrice(event).toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={group.href}
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
