import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { LinkSlot } from '@/shared/content/articles';
import type { Event } from '@/shared/types';
import { leadPrice } from '@/shared/pricing';
import { formatCurrency, formatEventDate } from '@/shared/utils';

/**
 * A dynamic link block inside an article.
 *
 * The events are resolved at render time against live inventory, so the article body
 * never needs editing to stay current — and every link points at something on sale
 * rather than at a page that 410s.
 */
export function ArticleLinks({ slot, events }: { slot: LinkSlot; events: Event[] }) {
  return (
    <aside className="rounded-xl border border-primary/25 bg-card/50 p-5">
      <h2 className="font-headline text-lg font-semibold">{slot.heading}</h2>
      <ul className="mt-3 divide-y divide-border">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="group flex items-baseline justify-between gap-4 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium group-hover:text-primary">
                  {event.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatEventDate(event.date)} · {event.location}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-primary">
                {leadPrice(event) === 0
                  ? 'Free'
                  : formatCurrency(leadPrice(event), event.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={slot.href}
        className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        See all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </aside>
  );
}
