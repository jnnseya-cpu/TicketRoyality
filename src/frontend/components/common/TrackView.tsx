'use client';

import * as React from 'react';

import { track } from '@/frontend/lib/analytics';

/**
 * Fires a view_event (Meta ViewContent / GA4 view_item) once per mount — dropped into
 * server-rendered pages that cannot call the tracker themselves. Renders nothing.
 */
export function TrackView({
  id,
  name,
  value,
  currency,
  category,
}: {
  id: string;
  name: string;
  value?: number;
  currency?: string;
  category?: string;
}) {
  React.useEffect(() => {
    track('view_event', { id, name, value, currency, category });
    // Once per page view of this item, deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
