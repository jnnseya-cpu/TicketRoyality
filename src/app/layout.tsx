import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';

import './globals.css';
import { Header } from '@/frontend/components/common/Header';
import { Footer } from '@/frontend/components/common/Footer';
import { SplashScreen } from '@/frontend/components/common/SplashScreen';
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
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
              <SplashScreen />
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
              <Toaster />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
