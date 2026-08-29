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
import { cn } from '@/shared/utils';
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
 * Headline facts.
 *
 * Every one of these is checkable against the code, and that is the whole rule for this
 * block: **nothing here may be a number we cannot stand behind** (CLAUDE.md §6).
 *
 * It previously read "10M+ Tickets Issued · 25K+ Events Powered · 2M+ Happy Fans ·
 * 99.99% Uptime" on a platform that had issued no tickets, run no events and had no
 * uptime history to measure. Invented traffic numbers are the easiest claim to
 * disprove and the most expensive to be caught on — and on this page they sit beside
 * FAQ structured data, which search engines quote to users as fact.
 *
 * Volume claims belong here only when they are read from the database. Until then
 * these describe how the platform works, which is true on day one and still true at
 * ten million tickets.
 */
const HEADLINE_STATS = [
  // src/shared/constants/billing.ts — DEFAULT_COMMISSION_PERCENT and DEFAULT_ADMIN_FEE
  // are both 0. The organiser is charged nothing and is paid the whole face value;
  // `shared/fees.ts` carries the buyer-side service fee that replaced it.
  { value: '0%', label: 'Organiser commission. You keep 100% of your ticket value' },
  // firestore.rules only permits valid -> redeemed, on the status field alone, so a
  // ticket cannot be reset and reused even by the organiser who owns the event.
  { value: '1', label: 'Scan per ticket, enforced in the database' },
  // functions/src/issuance.ts checks sold + quantity against the tier inside a
  // Firestore transaction. Covered by 10 emulator tests against real transactions.
  { value: '0', label: 'Oversold tickets, by construction' },
  // src/backend/ai/gateway.ts — Gemini, Claude, OpenAI, in that order.
  { value: '3', label: 'AI providers, with automatic failover' },
];

const CORE_FEATURES = [
  {
    icon: TrendingUp,
    title: 'You keep 100% of face',
    // billing.ts DEFAULT_COMMISSION_PERCENT/ADMIN_FEE = 0; fees.ts carries the buyer-side fee.
    body: '0% organiser commission — ever. Your fans pay one fair, all-in service fee shown before they check out, and every penny of face value is yours. No skim, no drip pricing, no surprise line at the till.',
  },
  {
    icon: Store,
    title: 'Sell at the door',
    // box-office.ts — walk-up sales through the one issuance path; PIN-gated staff link.
    body: 'Walk-up sales in seconds — cash, card or mobile money — each a real, scannable, counted ticket at the same price as online. Hand your gate team a PIN-protected link and they sell without your login.',
  },
  {
    icon: Ticket,
    title: 'Sell anything, any way',
    body: 'Concerts, matches, conferences, festivals, VIP nights — with tiers, presales, season tickets, tables and tracked promoter links, all from one event.',
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
    // Accurate and now stronger than it was: the code rotates every 30 seconds, and
    // redemption runs in one transaction so two doors cannot both admit one ticket.
    // Deliberately no longer claims a "verification engine" — there is no fraud model
    // behind this, and there does not need to be for what it does.
    body: 'Every ticket scans once. The code refreshes every 30 seconds so a forwarded screenshot is stale, and a redeemed ticket cannot be reset and reused.',
  },
  {
    icon: Crown,
    title: 'VIP & Hospitality',
    // This once promised tables that did not exist and was cut back to priced tiers.
    // Packages, deposits, balances and named guests are now built and tested, so the
    // claim comes back — bounded to what the code does, which is not a concierge.
    body: 'Price the room in tiers, or sell a table whole — inclusions, a deposit now, the balance on your date, and a guest list the booker fills in.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Dashboard',
    body: 'Track sales, attendance, revenue, and entry activity live from your command centre.',
  },
  {
    icon: LayoutGrid,
    title: 'Zones & Capacity',
    // Venue zones shipped: per-zone capacity, a zone scanner, tier allow-lists and a
    // re-entry rule, all enforced in one transaction at the door. Seat-level inventory
    // still is not built, so sections stay described as display and pricing.
    body: 'Doors inside the venue that admit only the tiers you assign, each with its own limit and its own re-entry rule, counted live as people come and go.',
  },
  {
    icon: Handshake,
    title: 'Door Staff Access',
    // Was promoter and venue-manager access to "operational nodes". There is no promoter
    // model — STATUS.md lists affiliate/promoter attribution as Not built. What exists is
    // a per-event check-in page, which is genuinely useful and genuinely all there is.
    body: 'A per-event check-in page your staff can open on any phone. It validates that event only, and the server proves the scanner owns the event before a ticket moves.',
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
  { name: 'Standard tickets', live: true },
  { name: 'VIP tiers, tables & hospitality', live: true }, // packages/deposits/balances/guest list — built & tested
  { name: 'Free and guest-list places', live: true },
  { name: 'Discount codes & tracked promoter links', live: true }, // coupons + partner attribution shipped
  { name: 'Sell at the door — cash, card or mobile money', live: true }, // box-office / door sales
  { name: 'Season tickets, presales & renewals', live: true }, // season passes + loyalty presale + holder-first renewal
  // Still specified and absent. Listed rather than hidden — an organiser choosing a
  // platform is entitled to know what is coming — but marked, because this block must
  // never read as live when the code is not.
  { name: 'Merchandise and add-ons', live: false },
  { name: 'Parking and food', live: false },
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
              0% organiser commission · You keep 100% of face
            </Badge>

            <h1 className="font-headline text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
              Sell out the room.
              <br />
              Keep every penny of face.
              <br />
              <span className="text-royal">Run the night like royalty.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Premium ticketing for stadiums, festivals, concerts and VIP nights. We charge you
              nothing — <strong className="text-foreground">0% commission, 100% of face value is
              yours</strong> — while your fans pay one fair, all-in price with no nasty surprise at
              checkout. Every ticket refreshes its code every 30 seconds, so it can&apos;t be
              faked, forwarded or scanned twice. Sell online, <strong className="text-foreground">at
              the door</strong>, by card or mobile money.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="royal" asChild>
                <Link href="/register/organiser">
                  Start selling — free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/events">Browse live events</Link>
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
              Built for <span className="text-royal">serious events</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              From the first sale to the final scan, you hold every lever — pricing, capacity,
              the door, the money. No overselling. No fake tickets. No commission skimmed off the
              top. Just your event, run properly.
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
      <VideoAds events={events} />

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
              {/* Tables, deposits, balances and named guests are built and tested. The
                  claim stops at what the code does: it books, prices, chases and seats a
                  table. It does not run a concierge or route drinks to it. */}
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Premium &amp; hospitality
              </p>
              <p className="mt-1 font-headline text-lg font-semibold text-white">
                Sell the best seats as their own inventory
              </p>
              <p className="mt-1 text-sm text-white/75">
                A VIP tier is priced, capped and reconciled exactly like general admission —
                and a table sells whole, on a deposit, with the guest list named before the
                doors.
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
            One infrastructure. Multiple income streams — and an honest list of which ones
            you can sell today.
          </p>
          <Badge variant="gold" className="mt-4 gap-1">
            <Store className="h-3 w-3" />
            {REVENUE_TOOLS.filter((t) => t.live).length} live today ·{' '}
            {REVENUE_TOOLS.filter((t) => !t.live).length} on the roadmap
          </Badge>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REVENUE_TOOLS.map((tool) => (
            <div
              key={tool.name}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3.5 text-sm transition-colors',
                tool.live
                  ? 'border-border/70 bg-card/40 hover:border-primary/40'
                  : 'border-dashed border-border/50 text-muted-foreground'
              )}
            >
              <Zap
                className={cn('h-4 w-4 shrink-0', tool.live ? 'text-primary' : 'text-muted-foreground/60')}
              />
              <span className="flex-1">{tool.name}</span>
              {!tool.live && <span className="text-xs">soon</span>}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final CTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-t border-border/60">
        {/* A faint ruled ledger grid rather than a gold radial glow — flat register. */}
        <div className="absolute inset-0 grid-backdrop opacity-40" />
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
