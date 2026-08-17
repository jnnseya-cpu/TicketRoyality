import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Building2,
  Church,
  Clapperboard,
  Crown,
  Heart,
  HeartHandshake,
  Music,
  PartyPopper,
  Presentation,
  Tent,
  Trophy,
  Wine,
} from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';

export const metadata: Metadata = {
  title: 'Industries',
  description:
    'One inventory model across stadiums, festivals, theatres, conferences, nightclubs, sports clubs, weddings, birthdays and every kind of party, places of worship, charity and corporate events. Each segment lists what the platform does today and what it does not.',
};

/**
 * The segments the platform sells to.
 *
 * Every `detail` string here describes something that is built, and was checked against
 * `/STATUS.md` rather than against `docs/`. That distinction is the whole point of this
 * rewrite: the previous copy promised seat-level inventory, gates that admit only
 * assigned ticket types, sub-promoter settlement waterfalls, presale windows gated by
 * loyalty tier, wristbands, an emergency blocklist, corporate tables with deposits and
 * balances, invite-only ticket types with access codes, and a full seat map editor with
 * obstructed-view tagging. **None of those exist.** `STATUS.md` lists venue zones,
 * hospitality, loyalty, promoter attribution and venue map generation under "Not built",
 * and the seat map row reads "preview/display only — no editor, no generator".
 *
 * So `detail` is what an organiser in that segment can do today, and `next` is the thing
 * they will ask for that is not there yet, said plainly. A prospect who buys on a
 * promise and discovers the gap at their first event is a refund and a review; one who
 * knew going in is a customer. The honest version also sells better, because "free
 * tickets carry no commission at all" is true and unusual, while "settlement waterfall"
 * was neither.
 */
const SEGMENTS = [
  {
    icon: Trophy,
    name: 'Stadiums & arenas',
    need: 'Tiered inventory, fast entry, one revenue picture',
    detail:
      'Price the ground in tiers — general, premium, VIP — each with its own capacity, and let issuance enforce it: a tier cannot be oversold even under a simultaneous rush. Define doors within the ground that admit only the tiers you assign to them, each with its own limit and its own re-entry rule, and sell hospitality tables as inventory alongside the tickets.',
    next: 'Seat-level inventory — a specific seat sold to a specific person — is not built. Sections are display and pricing.',
  },
  {
    icon: Tent,
    name: 'Festivals',
    need: 'Multi-day passes, capacity you cannot exceed',
    detail:
      'Sell a day pass and a full-weekend pass as separate tiers of one event, each capped independently. Capacity holds under load because tickets are issued in a Firestore transaction, not checked and then written. Arenas, camping and backstage can each be their own zone, capped separately and counted live as people come and go.',
    next: 'Wristbands and arrival forecasting are not built yet. Zones cap and count each area live; they do not read an RFID band.',
  },
  {
    icon: Music,
    name: 'Concert promoters',
    need: 'Tiered pricing, coupons, commission you can see',
    detail:
      'Run early-bird, general and VIP from one event, discount with coupon codes, and keep 100% of every ticket value — we charge organisers no commission at all. Buyers pay one service fee, shown inside the advertised price.',
    next: 'Sub-promoter allocations and multi-party settlement are on the roadmap, not in the product.',
  },
  {
    icon: Trophy,
    name: 'Sports clubs',
    need: 'Recurring fixtures without rebuilding them',
    detail:
      'Set a fixture to repeat weekly or monthly to an end date rather than creating each one by hand, with tiers and pricing carried across. Scan entry at the turnstile from any phone.',
    next: 'Season passes, member priority and loyalty-gated presale windows are not built.',
  },
  {
    icon: Presentation,
    name: 'Conferences',
    need: 'Physical, online and livestream from one event',
    detail:
      'One event can be in-person, online or livestreamed, with speakers listed on the page and the same entry validation and revenue reporting across all three formats.',
    next: 'Per-session ticketing and agenda scheduling are not built.',
  },
  {
    icon: Wine,
    name: 'Nightclubs',
    need: 'Door throughput on the phones you already have',
    detail:
      'A per-event check-in page scans QR codes and redeems them on the spot, on as many devices as you have staff. A redeemed ticket cannot be redeemed twice, and redeemed tickets are protected from refund. Tables sell as packages with a deposit now and the balance later, and the booker names their own guest list.',
    next: 'A live blocklist is not built. Scanning needs signal — there is no offline mode.',
  },
  {
    icon: Clapperboard,
    name: 'Theatres',
    need: 'Sections, rows and repeat performances',
    detail:
      'Define colour-coded sections with lettered rows, seats per row and a price each; the venue layout renders on the event page. Repeat a production across a run without rebuilding it each night.',
    next: 'A seat map editor, per-seat selection at checkout, obstructed-view tagging and held accessible seating are specified but not built — sections are display and pricing today, not seat-level inventory.',
  },
  {
    icon: Church,
    name: 'Places of worship',
    need: 'Free entry, real capacity limits, no fees',
    detail:
      'Free tickets carry no commission and no admin fee — a 300-place free list costs nothing. Capacity is still enforced, so a hall is never oversold, and everyone gets a QR pass that scans at the door.',
    next: 'Pay-what-you-want giving is not built; a contribution has to be a priced tier.',
  },
  {
    icon: HeartHandshake,
    name: 'Charity & fundraising',
    need: 'Priced giving tiers, fees you can point at',
    detail:
      'Name your tiers after what they fund and price them accordingly. We take no commission, so every penny of face value reaches the cause and you can tell a donor exactly that. Corporate tables sell whole, with a deposit up front, the balance due on a date you set, and named guests with their dietary and access needs. Free places cost nobody anything.',
    next: 'Pay-what-you-want giving and live auction lots are not built; a contribution has to be a priced tier.',
  },
  {
    icon: Building2,
    name: 'Corporate & internal',
    need: 'Free staff passes, a list of who is coming',
    detail:
      'Issue free passes at no cost, cap the headcount, and see the attendee list in your dashboard. Coupon codes restrict a price to people who have the code.',
    next: 'Hidden and invite-only ticket types, and access codes that gate visibility rather than price, are not built.',
  },
  {
    icon: PartyPopper,
    name: 'Parties & celebrations',
    need: 'Birthdays, private hire, a guest count you control',
    detail:
      'Birthday parties, graduations, hen and stag nights, house, day and boat parties. Sell paid entry or issue free places, cap the guest list so a venue is never oversold, and check people in from a phone at the door.',
    next: null,
  },
  {
    icon: Heart,
    name: 'Weddings',
    need: 'Guest lists that are not ticket sales',
    detail:
      'Issue free places to a guest list at no cost to you — free tickets carry no commission. Every guest gets a QR pass that scans at the door in seconds, and the count cannot exceed what the venue holds.',
    next: 'Guests contributing an amount of their choosing is not built; a contribution has to be a priced tier.',
  },
];

export default function IndustriesPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Segment coverage
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          Twelve segments. One inventory model.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A VIP place, a general-admission ticket and a livestream pass are the same
          object with different tiers. That is why you can run all three from one event
          instead of running two products and two reconciliations.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Each card says what the platform does for that segment today, and what it does
          not do yet. We would rather you found the gap here than at your first event.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map((segment) => (
          <Card key={segment.name} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 pt-6">
              <segment.icon className="h-7 w-7 text-primary" />
              <h2 className="font-headline text-xl font-semibold">{segment.name}</h2>
              <p className="text-sm font-medium text-primary">{segment.need}</p>
              <p className="flex-1 text-sm text-muted-foreground">{segment.detail}</p>
              {segment.next && (
                <p className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Not yet: </span>
                  {segment.next}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-12 border-primary/30 bg-card/60">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Crown className="h-8 w-8 text-primary" />
          <h2 className="font-headline text-2xl font-bold">
            One inventory model, whatever you are selling
          </h2>
          {/* This block once promised hospitality that did not exist, and was cut back to
              "a VIP tier is a priced tier" for a year. Packages, deposits, balances and
              named guests are now built and tested; a concierge workflow and per-guest
              ticket delivery are still not, and that distinction is what this says. */}
          <p className="max-w-2xl text-muted-foreground">
            A VIP place, a general-admission ticket and a livestream pass are the same
            object at different prices, so they sell from one event and reconcile in one
            report. A hospitality table is that same inventory sold whole — with
            inclusions, a deposit now, the balance on a date you set, and a guest list the
            booker fills in. Tickets are issued when the balance settles, never on the
            deposit.
          </p>
          <Button asChild>
            <Link href="/register/organiser">
              Start selling <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
