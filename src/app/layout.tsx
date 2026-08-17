import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';

import './globals.css';
import { Header } from '@/frontend/components/common/Header';
import { Footer } from '@/frontend/components/common/Footer';
import { AppleSplashLinks } from '@/frontend/components/common/AppleSplashLinks';
import { SplashScreen } from '@/frontend/components/common/SplashScreen';
import { InstallPrompt } from '@/frontend/components/common/InstallPrompt';
import { ServiceWorker } from '@/frontend/components/common/ServiceWorker';
import { ThemeProvider } from '@/frontend/components/common/ThemeProvider';
import { Toaster } from '@/frontend/components/ui/toaster';
import { AuthProvider } from '@/frontend/hooks/use-auth';
import { CartProvider } from '@/frontend/hooks/use-cart';
import { SiteStructuredData } from '@/frontend/components/seo/StructuredData';
import { siteUrl } from '@/shared/site';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
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
  // Deliberately not `maximumScale: 1` / `userScalable: false`. Locking zoom is the
  // usual way to make a web app feel native and it takes pinch-zoom away from anyone
  // who needs it to read — including someone squinting at a QR code in a dark venue.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes writes the class before React hydrates,
    // and browser extensions (password managers) inject attributes into form controls.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body suppressHydrationWarning className="min-h-screen bg-background">
        <SiteStructuredData />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            <CartProvider>
              <AppleSplashLinks />
              <SplashScreen />
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
              <Toaster />
              <InstallPrompt />
              <ServiceWorker />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
