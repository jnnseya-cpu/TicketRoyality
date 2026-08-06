import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Crown,
  Handshake,
  LayoutGrid,
  Megaphone,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { Separator } from '@/frontend/components/ui/separator';
import VideoAds from '@/frontend/components/home/VideoAds';
import { FeaturedEvents, UpcomingSample } from '@/frontend/components/home/FeaturedEvents';
import { QuickDiscovery } from '@/frontend/components/home/QuickDiscovery';
import { getEvents } from '@/shared/data/repositories';
import { PersonalizedRecommendations } from '@/frontend/components/ai/PersonalizedRecommendations';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';

const TRUST_POINTS = [
  { icon: QrCode, label: 'Secure QR Access' },
  { icon: ScanLine, label: 'Real-time Entry Control' },
  { icon: Crown, label: 'Premium Fan Experience' },
];

const NO_MORE = [
  'No fake tickets.',
  'No gate confusion.',
  'No lost revenue.',
  'No outdated spreadsheets.',
];

/**
 * Headline platform metrics.
 *
 * These are marketing claims, not values read from the database. Keep them here as a
 * single named constant so they are easy to find, verify against real figures, and
 * replace with live counts once the platform has traded.
 */
const HEADLINE_STATS = [
  { value: '10M+', label: 'Tickets Issued' },
  { value: '25K+', label: 'Events Powered' },
  { value: '2M+', label: 'Happy Fans' },
  { value: '99.99%', label: 'Uptime & Security' },
];

const CORE_FEATURES = [
  {
    icon: Ticket,
    title: 'Smart Ticket Sales',
    body: 'Create and sell tickets for concerts, football matches, conferences, festivals, and VIP experiences.',
  },
  {
    icon: QrCode,
    title: 'Secure QR Tickets',
    body: 'Every ticket gets a unique QR code that can only be used once, preventing duplicates and unauthorised resale.',
  },
  {
    icon: ScanLine,
    title: 'Live Entry Validation',
    body: 'Gate staff scan tickets instantly using mobile or tablet devices for lightning-fast entry processing.',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud Protection',
    body: 'Duplicate, copied or already-used tickets are rejected in real time by our verification engine.',
  },
  {
    icon: Crown,
    title: 'VIP & Premium Sections',
    body: 'Sell premium seats, hospitality packages, VIP lounges, tables, and exclusive experiences.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Dashboard',
    body: 'Track sales, attendance, revenue, and entry activity live from your command centre.',
  },
  {
    icon: LayoutGrid,
    title: 'Seat & Zone Control',
    body: 'Manage general admission, numbered seats, VIP zones, and restricted infrastructure sections.',
  },
  {
    icon: Handshake,
    title: 'Promoter & Partner Access',
    body: 'Give controlled access to promoters and venue managers to monitor their specific operational nodes.',
  },
];

const SEGMENTS = [
  { icon: Megaphone, audience: 'For Organisers', value: 'More control, more revenue, zero fraud.' },
  { icon: Users, audience: 'For Fans', value: 'Faster entry, safer tickets, better experience.' },
  { icon: Building2, audience: 'For Venues', value: 'Cleaner operations, real-time visibility.' },
  { icon: TrendingUp, audience: 'For Promoters', value: 'Professional ticket sales without chaos.' },
];

const EXPERIENCE_STEPS = [
  'Elegant checkout.',
  'Branded digital tickets.',
  'Instant confirmation.',
  'Fast gate entry.',
  'Premium event credibility.',
];

const REVENUE_TOOLS = [
  'Standard Tickets',
  'VIP Packages',
  'Hospitality Access',
  'Add-ons',
  'Food & Drink',
  'Merchandise',
  'Parking',
  'Sponsor Visibility',
];

/** Small uppercase kicker above each section heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{children}</p>
  );
}

export default async function HomePage() {
  // Fast-decision surfaces need real inventory. Failure degrades to nothing rendered
  // rather than a broken homepage.
  const events = await getEvents().catch(() => []);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        <Image
          src={PLACEHOLDER_IMAGES.heroCrowd}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="absolute inset-0 grid-backdrop opacity-60" />

        <div className="container relative py-24 lg:py-32">
          <div className="max-w-3xl animate-fade-in-up">
            <Badge variant="gold" className="mb-5 gap-1.5 px-3 py-1">
              <Crown className="h-3.5 w-3.5" />
              Premium Event Access · Verified Tickets · Royal Experience
            </Badge>

            <h1 className="font-headline text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
              Sell Out Events.
              <br />
              Control Every Ticket.
              <br />
              <span className="text-royal">Deliver a Royal Experience.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              TicketRoyality is a premium ticketing infrastructure built for stadiums, concerts,
              festivals, and VIP events — powered by AI orchestration and real-time fraud
              verification.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="royal" asChild>
                <Link href="/register/organiser">
                  Launch Your Event <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/events">Enter Platform</Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
              {TRUST_POINTS.map((point) => (
                <div key={point.label} className="flex items-center gap-2 text-sm">
                  <point.icon className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Operational core                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>Operational core</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              Built for <span className="text-royal">Serious Events</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              TicketRoyality gives event organisers total control from first sale to final scan.
              A distributed infrastructure for high-trust event orchestration.
            </p>

            <ul className="mt-6 space-y-3">
              {NO_MORE.map((line) => (
                <li key={line} className="flex items-center gap-3 text-sm">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {HEADLINE_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border/70 bg-background/40 p-4"
                >
                  <p className="font-headline text-xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-xl gold-ring">
            <Image
              src={PLACEHOLDER_IMAGES.stadium}
              alt="A packed stadium at night"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* System modules                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16">
        <div className="mb-10 text-center">
          <Eyebrow>System modules</Eyebrow>
          <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">Core Features</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Everything a modern event operation needs, in one place.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="group h-full border-border/70 bg-card/50 transition-colors hover:border-primary/40"
            >
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-headline text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Promoted video ad slots */}
      <VideoAds />

      {/* Featured placements */}
      <QuickDiscovery events={events} />

      <FeaturedEvents />

      {/* Rotating upcoming sample */}
      <UpcomingSample />

      {/* AI recommendations */}
      <PersonalizedRecommendations />

      {/* ------------------------------------------------------------------ */}
      {/* Segment advantage                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container">
          <div className="mb-10 text-center">
            <Eyebrow>Segment advantage</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              Why <span className="text-royal">TicketRoyality</span> Wins
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SEGMENTS.map((segment) => (
              <Card key={segment.audience} className="border-border/70 bg-background/40">
                <CardContent className="p-6">
                  <segment.icon className="mb-4 h-6 w-6 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {segment.audience}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{segment.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The fan journey                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative order-2 aspect-[4/3] overflow-hidden rounded-xl gold-ring lg:order-1">
            <Image
              src={PLACEHOLDER_IMAGES.vipLounge}
              alt="A VIP lounge before doors open"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                VIP Lounge · Premium Node
              </p>
              <p className="mt-1 font-headline text-lg font-semibold text-white">
                Hospitality Orchestration
              </p>
              <p className="mt-1 text-sm text-white/75">
                Manage exclusive access points for high-value attendees with real-time capacity
                monitoring.
              </p>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <Eyebrow>The fan journey</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              Premium Event Experience
            </h2>
            <p className="mt-4 text-muted-foreground">
              From the first click to the final scan, TicketRoyality makes your event feel bigger,
              sharper and more professional.
            </p>

            <div className="mt-6 space-y-3">
              {EXPERIENCE_STEPS.map((step, index) => (
                <div key={step} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-headline text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator className="my-16" />

        <div className="text-center">
          <Eyebrow>Monetization</Eyebrow>
          <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">Revenue Tools</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            One infrastructure. Multiple income streams.
          </p>
          <Badge variant="gold" className="mt-4 gap-1">
            <Store className="h-3 w-3" /> Eight ways to earn from the same audience
          </Badge>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REVENUE_TOOLS.map((tool) => (
            <div
              key={tool}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-4 py-3.5 text-sm transition-colors hover:border-primary/40"
            >
              <Zap className="h-4 w-4 shrink-0 text-primary" />
              {tool}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final CTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-t border-border/60">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.16),transparent_65%)]" />
        <div className="container relative py-20 text-center">
          <Sparkles className="mx-auto mb-5 h-8 w-8 text-primary" />
          <h2 className="mx-auto max-w-3xl font-headline text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            Your Event Deserves More Than <span className="text-royal">Basic Ticketing</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            TicketRoyality gives you the control, security and premium experience needed to run
            powerful modern events.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="royal" asChild>
              <Link href="/register/organiser">
                Launch Your Event Today <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/events">Enter Platform &amp; Explore Events</Link>
            </Button>
          </div>

          <p className="mt-10 font-headline text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Where Every Ticket Feels Royal
          </p>
        </div>
      </section>
    </>
  );
}
