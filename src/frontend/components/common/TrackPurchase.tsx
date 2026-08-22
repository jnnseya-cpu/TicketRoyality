'use client';

import * as React from 'react';

import { track } from '@/frontend/lib/analytics';

/**
 * Fires a Purchase (Meta) / purchase (GA4) once per landing on a success page.
 *
 * The amount and currency ride the redirect from the checkout that knew them — a
 * conversion pixel with no value is a conversion the ad tools cannot optimise on.
 * The reference (Stripe session id, KODA intent, or a generated id) deduplicates:
 * both vendors drop a repeated transaction_id/eventID, so a refreshed success page
 * does not double-count, and sessionStorage backstops vendors that do not.
 */
export function TrackPurchase({
  reference,
  amount,
  currency,
  category,
}: {
  reference?: string;
  amount?: number;
  currency?: string;
  category?: string;
}) {
  React.useEffect(() => {
    const id = reference || `tr_${Math.random().toString(36).slice(2)}`;
    try {
      const key = `tr:purchase:${id}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      /* private mode — the vendors' own dedupe still applies */
    }
    track('purchase', {
      id,
      value: amount,
      currency,
      category,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
