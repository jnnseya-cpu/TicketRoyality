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
  Store,
  Ticket,
  TrendingUp,
  Users,
  WifiOff,
  Banknote,
  LifeBuoy,
  Zap,
} from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
import { cn } from '@/shared/utils';
import { CoverArt } from '@/frontend/components/brand/CoverArt';
import { FeeCalculator } from '@/frontend/components/home/FeeCalculator';
import VideoAds from '@/frontend/components/home/VideoAds';
import { ShowcaseScreen } from '@/frontend/components/home/ShowcaseScreen';
import { FeaturedEvents, UpcomingSample } from '@/frontend/components/home/FeaturedEvents';
import { QuickDiscovery } from '@/frontend/components/home/QuickDiscovery';
import { getEvents } from '@/shared/data/repositories';
import { PersonalizedRecommendations } from '@/frontend/components/ai/PersonalizedRecommendations';

const TRUST_POINTS = [
  { icon: QrCode, label: 'QR that can’t be faked' },
  { icon: WifiOff, label: 'Scans offline at the door' },
  { icon: Banknote, label: 'Cash, card & mobile money' },
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
  { value: '0%', label: 'We take in commission — you keep 100% of face value' },
  // firestore.rules only permits valid -> redeemed, on the status field alone, so a
  // ticket cannot be reset and reused even by the organiser who owns the event.
  { value: '1', label: 'Entry per ticket — two people can’t get in on one' },
  // functions/src/issuance.ts checks sold + quantity against the tier inside a
  // Firestore transaction. Covered by 10 emulator tests against real transactions.
  { value: '0', label: 'Times the same seat can sell twice' },
  // frontend/lib/offline-door.ts — the door caches a signed manifest in IndexedDB and
  // decides admission locally (decideOffline), queuing each redemption to sync later. A
  // real capability, not a slogan: the scanner admits guests with no connection at all.
  { value: 'Offline', label: 'Doors keep scanning when the internet drops' },
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
    title: 'The door works with no internet',
    // frontend/lib/offline-door.ts + shared/tickets/offline.ts: the manifest is cached in
    // IndexedDB and the admit/deny decision is made locally (decideOffline), so a dropped
    // signal at the gate does not stop the queue. Every scan is written locally first and
    // synced when the connection returns — a genuine offline path, not a retry.
    body: 'Download the guest list to the phone and the scanner keeps admitting even with no signal at all — every scan recorded locally and synced the moment you’re back online. The festival field and the basement club both just work.',
  },
  {
    icon: ShieldCheck,
    title: 'Tickets that can’t be faked',
    // Accurate and now stronger than it was: the code rotates every 30 seconds, and
    // redemption runs in one transaction so two doors cannot both admit one ticket.
    // Deliberately no longer claims a "verification engine" — there is no fraud model
    // behind this, and there does not need to be for what it does.
    body: 'Every ticket admits once. The QR refreshes every 30 seconds, so a forwarded screenshot is already stale, and a scanned ticket can’t be reset and waved through again — not even by the person who owns the event.',
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
    body: 'Sales, attendance, revenue and who has walked in — updating live on one screen as it happens.',
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

/**
 * Objection handling, not testimonials.
 *
 * A new platform has no reviews to borrow trust from, and inventing them is forbidden
 * (CLAUDE.md §6). What it can do honestly is answer the fears an organiser actually has
 * on the night — and every answer below is a real, checkable capability in this codebase,
 * not a promise. When there are real organisers to quote, their words go above this; this
 * stays, because "what happens when it breaks" outlasts any testimonial.
 */
const REASSURANCE = [
  {
    icon: WifiOff,
    q: 'The signal drops at the door',
    // frontend/lib/offline-door.ts — cached manifest, local decideOffline, queued sync.
    a: 'The scanner already has the guest list on the phone. It keeps admitting with no connection and records every entry locally, syncing the second you’re back online. A dead signal doesn’t stop your queue.',
  },
  {
    icon: ShieldCheck,
    q: 'A ticket gets screenshotted and passed around',
    // 30s rotating QR + one-transaction redemption in backend/services/redeem.ts.
    a: 'The code refreshes every 30 seconds, so a screenshot is stale before it reaches the gate, and once a ticket is scanned it can’t be reset and used again. One ticket, one entry.',
  },
  {
    icon: Banknote,
    q: 'You need your money',
    // 0% commission (billing.ts) — face value is never reduced. Cash/mobile money taken
    // at the door directly; card sales settle to the organiser's own account. No SLA is
    // claimed here on purpose — payout timing depends on the connected account.
    a: 'Every sale is yours at face value — nothing is skimmed off it. Cash and mobile money you take on the spot at the door; card sales settle to your own account after your event.',
  },
  {
    icon: LifeBuoy,
    q: 'Something goes wrong and you need a human',
    // The honest support surface: a real inbox, no invented 24/7 tier or phone line.
    a: 'You reach a real inbox at info@ticketroyality.com, answered by the people who build the platform — not a ticket queue that forgets you. We’d rather promise a reply than a hotline that isn’t staffed.',
  },
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
        {/* An engraved backdrop, not a stock crowd photo: the house rosework, held far
            back so the type carries the page. A printed programme cover, not a hero
            image bought by the thousand. */}
        <CoverArt seed="tr-hero-arena" aspect={16 / 6} frame={false} className="absolute inset-0 opacity-[0.18]" />
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

          {/* The premium showcase placement: a paid organiser's moving picture + video, or
              the static stadium when none is sold. */}
          <ShowcaseScreen
            event={events.find((e) => e.showcase)}
            fallback={
              <div className="relative aspect-[4/3] overflow-hidden rounded-[--radius] gold-ring">
                <CoverArt seed="tr-stadium" label="The Stand" aspect={4 / 3} className="absolute inset-0" />
              </div>
            }
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* What you keep — the calculator                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow>The money</Eyebrow>
          <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
            Do the sum on your own event
          </h2>
          <p className="mt-3 text-muted-foreground">
            Not a slogan about commission — your ticket, your numbers. We take{' '}
            <strong className="text-foreground">0% from you</strong> and earn from one clear,
            VAT-inclusive fee your fans see before they pay. It’s lower than the big platforms,
            so more baskets convert. Change the figures and check it against the quote you already have.
          </p>
        </div>
        <div className="mt-10">
          <FeeCalculator />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* System modules                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow>The system</Eyebrow>
          <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
            Everything you run, from one place
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pricing, the door, the money and the inventory — one operation, nothing bolted on.
          </p>
        </div>

        {/* An index, not a wall of tinted icon tiles: foil numerals, hairline rules,
            Didone titles — the register of a printed programme. */}
        <div className="mt-12 grid gap-x-14 sm:grid-cols-2">
          {CORE_FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="flex gap-5 border-t border-border/60 py-6 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
            >
              <span className="pt-1 font-mono text-xs tabular-nums text-primary/80">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <feature.icon className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="font-headline text-lg font-semibold leading-tight">
                    {feature.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </div>
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
          <div className="mb-10 max-w-2xl">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              One platform, four rooms
            </h2>
          </div>
          <div className="grid divide-y divide-border/60 border-y border-border/60 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {SEGMENTS.map((segment) => (
              <div
                key={segment.audience}
                className="px-0 py-6 sm:px-6 sm:py-2 sm:[&:nth-child(odd)]:pl-0 lg:border-l lg:border-border/60 lg:first:border-l-0 lg:[&:nth-child(odd)]:pl-6"
              >
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  {segment.audience}
                </p>
                <p className="mt-2 font-headline text-lg leading-snug">{segment.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The fan journey                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="container py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative order-2 aspect-[4/3] overflow-hidden rounded-[--radius] gold-ring lg:order-1">
            <CoverArt seed="tr-vip-lounge" label="The Box" aspect={4 / 3} className="absolute inset-0" />
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
            <Eyebrow>What the fan sees</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              One clean line, tap to door
            </h2>
            <p className="mt-4 text-muted-foreground">
              From the first tap to the scan at the gate, the buyer meets one branded flow — the
              all-in price shown before they pay, the ticket in their wallet a second later, no
              chain of redirects and no surprise line at the till.
            </p>

            <ol className="mt-8 divide-y divide-border/60 border-y border-border/60">
              {EXPERIENCE_STEPS.map((step, index) => (
                <li key={step} className="flex items-baseline gap-4 py-3.5">
                  <span className="font-headline text-lg font-semibold tabular-nums text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
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
      {/* Reassurance — the night-of fears, answered honestly                */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container">
          <div className="mb-10 max-w-2xl">
            <Eyebrow>Before you trust us with the night</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
              The questions that actually matter
            </h2>
            <p className="mt-3 text-muted-foreground">
              We’re new, and we won’t pretend otherwise with borrowed logos or invented
              reviews. Here is what actually happens when it counts — every answer is a real
              part of the platform, not a promise.
            </p>
          </div>
          <div className="grid gap-x-14 sm:grid-cols-2">
            {REASSURANCE.map((item, i) => (
              <div
                key={item.q}
                className="flex gap-5 border-t border-border/60 py-6 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <span className="pt-1 font-mono text-xs tabular-nums text-primary/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0 text-primary" />
                    <h3 className="font-headline text-lg font-semibold leading-tight">{item.q}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final CTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-t border-border/60">
        {/* A faint ruled ledger grid rather than a gold radial glow — flat register. */}
        <div className="absolute inset-0 grid-backdrop opacity-40" />
        <div className="container relative py-20 text-center">
          {/* A struck foil rule, not a sparkle. */}
          <div className="mx-auto mb-6 h-px w-16 bg-primary/60" />
          <h2 className="mx-auto max-w-3xl font-headline text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            Keep the whole gate. <span className="text-royal">Run the whole night.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            Zero commission, tickets that can&apos;t be faked, and door sales in cash, card or
            mobile money — set up an event and start selling in minutes.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="royal" asChild>
              <Link href="/register/organiser">
                Start selling — free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/events">Browse live events</Link>
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
