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

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import VideoAds from '@/components/home/VideoAds';
import { FeaturedEvents, UpcomingSample } from '@/components/home/FeaturedEvents';
import { PersonalizedRecommendations } from '@/components/ai/PersonalizedRecommendations';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

const TRUST_POINTS = [
  { icon: QrCode, label: 'Secure QR access' },
  { icon: ScanLine, label: 'Real-time entry control' },
  { icon: Crown, label: 'Premium fan experience' },
];

const CORE_FEATURES = [
  {
    icon: Ticket,
    title: 'Smart Ticket Sales',
    body: 'Create and sell tickets for concerts, football matches, conferences, festivals, theatre nights, VIP experiences and private events.',
  },
  {
    icon: QrCode,
    title: 'Secure QR Tickets',
    body: 'Every ticket carries a unique QR code that can only ever be used once, bound to the event it was issued for.',
  },
  {
    icon: ScanLine,
    title: 'Live Entry Validation',
    body: 'Gate staff scan tickets instantly on any phone or tablet through a shareable check-in portal.',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud Protection',
    body: 'Duplicated, copied or already-scanned tickets are rejected in real time with an unmistakable red result.',
  },
  {
    icon: Crown,
    title: 'VIP & Premium Sections',
    body: 'Sell premium seats, hospitality packages, VIP lounges, tables, backstage access and exclusive experiences.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Dashboard',
    body: 'Track sales, attendance, revenue, ticket categories, remaining capacity and entry activity as it happens.',
  },
  {
    icon: LayoutGrid,
    title: 'Seat & Zone Control',
    body: 'Manage general admission, numbered seats, VIP zones, hospitality areas and restricted sections from one map.',
  },
  {
    icon: Handshake,
    title: 'Promoter & Partner Access',
    body: 'Give scoped access to promoters, event teams, sponsors and venue managers without exposing your finances.',
  },
];

const SEGMENTS = [
  {
    icon: Megaphone,
    audience: 'For organisers',
    value: 'More control, more revenue, less fraud.',
  },
  { icon: Users, audience: 'For fans', value: 'Faster entry, safer tickets, better experience.' },
  {
    icon: Building2,
    audience: 'For venues',
    value: 'Cleaner operations, real-time visibility, stronger security.',
  },
  {
    icon: TrendingUp,
    audience: 'For promoters',
    value: 'Professional ticket sales without the chaos.',
  },
];

const EXPERIENCE_STEPS = [
  'Elegant checkout',
  'Branded digital tickets',
  'Instant confirmation',
  'Fast gate entry',
  'Premium event credibility',
];

const REVENUE_TOOLS = [
  'Standard tickets',
  'VIP packages',
  'Hospitality access',
  'Event add-ons',
  'Merchandise',
  'Food & drink vouchers',
  'Parking',
  'Sponsor visibility',
];

const NO_MORE = [
  'No fake tickets.',
  'No gate confusion.',
  'No lost revenue.',
  'No outdated spreadsheets.',
];

export default function HomePage() {
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
              TicketRoyality is a premium ticketing platform built for stadiums, concerts,
              festivals, clubs, promoters and VIP events — with secure QR tickets, real-time
              validation, fraud control, seat management and powerful event revenue tools.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="royal" asChild>
                <Link href="/register/organiser">
                  Launch Your Event <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/events">Enter the platform</Link>
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
      {/* Built for serious events                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-headline text-3xl font-bold sm:text-4xl">
              Built for <span className="text-royal">Serious Events</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              TicketRoyality gives event organisers total control from first sale to final scan.
            </p>

            <ul className="mt-6 space-y-3">
              {NO_MORE.map((line) => (
                <li key={line} className="flex items-center gap-3 text-sm">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm text-muted-foreground">
              Just a smooth, premium, high-trust event journey.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { value: '99.99%', label: 'Gate uptime' },
                { value: '<200ms', label: 'Scan validation' },
                { value: '1 scan', label: 'Per ticket, ever' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border/70 bg-background/40 p-4">
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
      {/* Core features                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16">
        <div className="mb-10 text-center">
          <h2 className="font-headline text-3xl font-bold sm:text-4xl">Core Features</h2>
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
      <FeaturedEvents />

      {/* Rotating upcoming sample */}
      <UpcomingSample />

      {/* AI recommendations */}
      <PersonalizedRecommendations />

      {/* ------------------------------------------------------------------ */}
      {/* Why TicketRoyality wins                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container">
          <h2 className="mb-10 text-center font-headline text-3xl font-bold sm:text-4xl">
            Why <span className="text-royal">TicketRoyality</span> Wins
          </h2>
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
      {/* Premium experience + revenue tools                                 */}
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>

          <div className="order-1 lg:order-2">
            <h2 className="font-headline text-3xl font-bold sm:text-4xl">
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
          <Badge variant="gold" className="mb-3 gap-1">
            <Store className="h-3 w-3" /> Multiple income streams
          </Badge>
          <h2 className="font-headline text-3xl font-bold sm:text-4xl">Revenue Tools</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            One platform. Eight ways to earn from the same audience.
          </p>
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
              <Link href="/events">Browse featured events</Link>
            </Button>
          </div>

          <p className="mt-10 font-headline text-sm uppercase tracking-[0.3em] text-muted-foreground">
            TicketRoyality — Where Every Ticket Feels Royal
          </p>
        </div>
      </section>
    </>
  );
}
