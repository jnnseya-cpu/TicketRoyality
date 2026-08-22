'use client';

/**
 * One tracking call, two destinations — the Meta Pixel and Google Tag (GA4).
 *
 * Every surface calls `track()` with ONE semantic event; this module translates it
 * into each vendor's canonical vocabulary (Meta standard events so their ad tooling
 * recognises purchases and carts; GA4 recommended events so reports and Google Ads
 * conversions light up without custom definitions). A surface never talks to `fbq`
 * or `gtag` directly — one vocabulary, one file to change when a vendor renames
 * something.
 *
 * Both tags load only when their IDs are configured AND the visitor has accepted
 * tracking (see Analytics.tsx) — so every function here no-ops safely when either
 * script is absent. Money values are MAJOR units, which is what both vendors expect.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type AnalyticsEvent =
  | 'page_view'
  | 'view_event'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'sign_up'
  | 'login'
  | 'search'
  | 'share'
  | 'reserve_table'
  | 'buy_placement';

export interface AnalyticsParams {
  /** What the event is about — an event title, a placement name, a search query. */
  name?: string;
  id?: string;
  /** MAJOR units. */
  value?: number;
  currency?: string;
  quantity?: number;
  /** The payment rail or content bucket, e.g. 'stripe', 'mobile-money', 'placement'. */
  category?: string;
  method?: string;
}

const metaNames: Record<AnalyticsEvent, string> = {
  page_view: 'PageView',
  view_event: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
  sign_up: 'CompleteRegistration',
  login: 'Login',
  search: 'Search',
  share: 'Share',
  reserve_table: 'InitiateCheckout',
  buy_placement: 'InitiateCheckout',
};

const gaNames: Record<AnalyticsEvent, string> = {
  page_view: 'page_view',
  view_event: 'view_item',
  add_to_cart: 'add_to_cart',
  begin_checkout: 'begin_checkout',
  purchase: 'purchase',
  sign_up: 'sign_up',
  login: 'login',
  search: 'search',
  share: 'share',
  reserve_table: 'begin_checkout',
  buy_placement: 'begin_checkout',
};

export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.fbq) {
      const custom = event === 'login';
      window.fbq(custom ? 'trackCustom' : 'track', metaNames[event], {
        ...(params.name ? { content_name: params.name } : {}),
        ...(params.id ? { content_ids: [params.id], content_type: 'product' } : {}),
        ...(params.value !== undefined ? { value: params.value } : {}),
        ...(params.currency ? { currency: params.currency } : {}),
        ...(params.quantity !== undefined ? { num_items: params.quantity } : {}),
        ...(params.category ? { content_category: params.category } : {}),
        ...(event === 'search' && params.name ? { search_string: params.name } : {}),
      });
    }
  } catch {
    // Analytics must never break a page.
  }

  try {
    if (window.gtag) {
      if (event === 'page_view') {
        window.gtag('event', 'page_view', {
          page_location: window.location.href,
          page_path: window.location.pathname,
        });
        return;
      }
      window.gtag('event', gaNames[event], {
        ...(params.value !== undefined ? { value: params.value } : {}),
        ...(params.currency ? { currency: params.currency } : {}),
        ...(event === 'search' && params.name ? { search_term: params.name } : {}),
        ...(event === 'share' ? { method: params.method ?? 'link', content_type: 'event' } : {}),
        ...(event === 'sign_up' || event === 'login'
          ? { method: params.method ?? 'password' }
          : {}),
        ...(params.category ? { item_category: params.category } : {}),
        ...(params.id || params.name
          ? {
              items: [
                {
                  item_id: params.id ?? '',
                  item_name: params.name ?? '',
                  ...(params.value !== undefined && params.quantity
                    ? { price: params.value / params.quantity }
                    : {}),
                  ...(params.quantity !== undefined ? { quantity: params.quantity } : {}),
                },
              ],
            }
          : {}),
        ...(event === 'purchase'
          ? { transaction_id: params.id ?? `tr_${Date.now()}` }
          : {}),
      });
    }
  } catch {
    // Same rule.
  }
}
