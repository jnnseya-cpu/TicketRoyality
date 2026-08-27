import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Newsreader, Space_Mono } from 'next/font/google';

import './globals.css';
import { Header } from '@/frontend/components/common/Header';
import { Footer } from '@/frontend/components/common/Footer';
import { AppleSplashLinks } from '@/frontend/components/common/AppleSplashLinks';
import { SplashScreen } from '@/frontend/components/common/SplashScreen';
import { InstallPrompt } from '@/frontend/components/common/InstallPrompt';
import { ServiceWorker } from '@/frontend/components/common/ServiceWorker';
import { Analytics } from '@/frontend/components/common/Analytics';
import { ThemeProvider } from '@/frontend/components/common/ThemeProvider';
import { Toaster } from '@/frontend/components/ui/toaster';
import { AuthProvider } from '@/frontend/hooks/use-auth';
import { CartProvider } from '@/frontend/hooks/use-cart';
import { SiteStructuredData } from '@/frontend/components/seo/StructuredData';
import { siteUrl } from '@/shared/site';

/*
 * "The Programme" type system. A high-contrast Didone for display, a warm text serif
 * for reading, and a monospace for the technical marks a ticket carries — no geometric
 * sans anywhere, which is half of why the app no longer reads as generated.
 */
const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
});
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  style: ['normal', 'italic'],
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Makes every relative OG image and canonical resolve against the real origin.
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'TicketRoyality — Premium Event Access. Verified Tickets.',
    template: '%s · TicketRoyality',
  },
  description:
    'TicketRoyality is a premium ticketing and event management platform built for stadiums, concerts, festivals, clubs, promoters and VIP events — with secure QR tickets, real-time validation, fraud control, seat management and powerful revenue tools.',
  keywords: [
    'ticketing platform',
    'event management',
    'QR tickets',
    'VIP hospitality',
    'stadium ticketing',
    'festival tickets',
  ],
  openGraph: {
    title: 'TicketRoyality — Where Every Ticket Feels Royal',
    description:
      'Sell out events. Control every ticket. Deliver a royal experience.',
    type: 'website',
  },
  applicationName: 'TicketRoyality',
  appleWebApp: {
    // iOS has no manifest support: these meta tags are the only way an installed
    // shortcut opens without Safari's chrome.
    capable: true,
    title: 'TicketRoyality',
    // `black-translucent` puts the page behind the status bar, which is what makes the
    // install genuinely full-bleed. It is also why the safe-area padding is not
    // optional — without it the header would sit under the clock.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    // Next renders `appleWebApp.capable` as the modern `mobile-web-app-capable`, which
    // Safari only began honouring in iOS 15.4. The legacy `apple-` tag is what every
    // iPhone before that reads, and without it those devices open the installed
    // shortcut inside Safari's chrome instead of full screen. Two tags, no conflict.
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The line that makes the app fill the screen. Without it iOS letterboxes a
  // standalone app between two bars in the theme colour, so a "full screen" install is
  // anything but. With it the page owns every pixel, and `env(safe-area-inset-*)` in
  // globals.css is what keeps content clear of the notch and the home indicator.
  viewportFit: 'cover',
  /*
   * `maximumScale: 1` suppresses the browser's AUTOMATIC zoom-on-focus — the bug that
   * twice left live testers with a phone view zoomed in and cropped ("the PWA does
   * not fit the screen") after tapping a form control. It does NOT take deliberate
   * zoom away from people who need it: iOS Safari (since 10) and Android Chrome both
   * ignore this cap for user pinch gestures and accessibility zoom; only the
   * automatic focus zoom respects it. `userScalable` is deliberately left alone.
   * Belt on top of braces: every focusable control is also ≥16px on mobile
   * (ui/input, ui/textarea, ui/select, and the seat-type select), which is what
   * stops the auto-zoom being wanted in the first place.
   */
  maximumScale: 1,
  themeColor: [
    // Match "The Programme" grounds: warm ink in dark, bone paper in light.
    { media: '(prefers-color-scheme: dark)', color: '#17130D' },
    { media: '(prefers-color-scheme: light)', color: '#F0EADB' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes writes the class before React hydrates,
    // and browser extensions (password managers) inject attributes into form controls.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodoni.variable} ${newsreader.variable} ${spaceMono.variable}`}
    >
      <body suppressHydrationWarning className="min-h-viewport bg-background">
        <SiteStructuredData />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            <CartProvider>
              <AppleSplashLinks />
              <SplashScreen />
              <div className="flex min-h-viewport flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
              <Toaster />
              <InstallPrompt />
              <ServiceWorker />
              {/* Meta Pixel + Google Tag, consent-gated. See the component. */}
              <Analytics />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
