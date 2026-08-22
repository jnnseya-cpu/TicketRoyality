'use client';

import * as React from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { Button } from '@/frontend/components/ui/button';
import { track } from '@/frontend/lib/analytics';

/**
 * The Meta Pixel and Google Tag, loaded once for the whole app — behind two gates.
 *
 * Gate one is configuration: each tag loads only when its ID is set
 * (`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`). No ID, no script,
 * no 404s in the console pretending to be analytics.
 *
 * Gate two is the visitor: nothing loads until they accept the banner below, and a
 * decline is remembered and honoured. This platform sells into the UK and EU, where
 * loading an advertising pixel before consent is the textbook PECR violation — and a
 * ticketing platform's credibility is exactly the wrong thing to spend on a tracking
 * shortcut. Google Consent Mode is set to granted at load time because load IS the
 * grant here; the scripts simply do not exist for a visitor who declined.
 *
 * Page views: the App Router navigates client-side, so both tags would otherwise see
 * only the first page of a session. The pathname effect fires a page_view into both
 * on every route change; the initial load is covered by each script's own bootstrap.
 */
const CONSENT_KEY = 'tr:tracking';

function readConsent(): 'granted' | 'denied' | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function Analytics() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();

  const [consent, setConsent] = React.useState<'granted' | 'denied' | null | 'unknown'>('unknown');

  React.useEffect(() => {
    setConsent(readConsent());
  }, []);

  const decide = (value: 'granted' | 'denied') => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* private mode — the choice lasts the session via state */
    }
    setConsent(value);
  };

  // A page_view into both tags on every client-side navigation.
  const firstRoute = React.useRef(true);
  React.useEffect(() => {
    if (firstRoute.current) {
      // The scripts' own bootstraps report the landing page.
      firstRoute.current = false;
      return;
    }
    track('page_view');
  }, [pathname]);

  const anyTag = Boolean(pixelId || gaId);
  if (!anyTag) return null;

  return (
    <>
      {consent === 'granted' && gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
            strategy="afterInteractive"
          />
          <Script id="tr-gtag" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('consent', 'default', {ad_storage:'granted', ad_user_data:'granted', ad_personalization:'granted', analytics_storage:'granted'});
gtag('config', '${gaId}');`}
          </Script>
        </>
      )}

      {consent === 'granted' && pixelId && (
        <Script id="tr-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
        </Script>
      )}

      {consent === null && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="container flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              We use cookies from Google and Meta to measure what works and to reach people
              like you with events they will love. Tickets work either way.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => decide('denied')}>
                No thanks
              </Button>
              <Button size="sm" variant="royal" onClick={() => decide('granted')}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
