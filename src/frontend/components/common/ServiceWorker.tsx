'use client';

import * as React from 'react';

/**
 * Registers the service worker, and offers a reload when a new one is waiting.
 *
 * The reload prompt is not decoration. A service worker serves the previous build until
 * every tab closes, and people do not close tabs — so without this an installed app can
 * sit on a stale bundle for days after a fix ships, which on a platform that sells
 * tickets means old prices in front of a real buyer.
 *
 * Registration is deliberately skipped in development: a worker caching localhost
 * survives `rm -rf .next`, and the resulting "my change did nothing" is very hard to
 * recognise as a caching problem.
 */
export function ServiceWorker() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` is null on a first install; only a *replacement* worker is
            // an update worth interrupting anyone for.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      } catch {
        // A failed registration costs offline support and nothing else. The app has to
        // keep working for anyone whose browser or privacy settings refuse workers.
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 z-50 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-card p-3 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
      // Sits above the iOS home indicator rather than under it.
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <p className="text-sm">A new version of TicketRoyality is ready.</p>
      <button
        type="button"
        onClick={() => {
          waiting.postMessage('SKIP_WAITING');
          // The new worker takes control on activation; reloading picks it up.
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        }}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
      >
        Reload
      </button>
    </div>
  );
}
