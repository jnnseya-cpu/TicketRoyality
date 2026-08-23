'use client';

import * as React from 'react';
import { Eye } from 'lucide-react';

/**
 * The article's view count — read, then bumped, from the browser, because the blog
 * pages are prerendered and a static page cannot count its own readers.
 *
 * One increment per browser session per article (sessionStorage), so refreshing an
 * article you are reading does not inflate it. Renders nothing until the number is
 * known: "0 views" flashing before the real count would be worse than a beat of
 * silence, and a brand-new article genuinely at zero still shows it honestly once
 * the answer arrives.
 */
export function ArticleViews({ slug }: { slug: string }) {
  const [views, setViews] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const key = `tr:viewed:${slug}`;
    let alreadyCounted = false;
    try {
      alreadyCounted = Boolean(window.sessionStorage.getItem(key));
      if (!alreadyCounted) window.sessionStorage.setItem(key, '1');
    } catch {
      // Private mode: count the view, skip the dedupe.
    }

    const request = alreadyCounted
      ? fetch(`/api/blog/views?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      : fetch('/api/blog/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
          keepalive: true,
        });

    request
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { views?: number } | null) => {
        if (!cancelled && data && typeof data.views === 'number') setViews(data.views);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (views === null) return null;

  return (
    <span className="flex items-center gap-1">
      <Eye className="h-3.5 w-3.5" />
      {new Intl.NumberFormat('en-GB').format(views)} view{views === 1 ? '' : 's'}
    </span>
  );
}
