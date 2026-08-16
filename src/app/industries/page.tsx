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
    'One inventory model across stadiums, festivals, theatres, conferences, nightclubs, sports clubs, weddings, birthdays and every kind of party, places of worship, charity and corporate events — plus VIP hospitality.',
};

/**
 * The segments the platform is built for, plus hospitality that runs across all of
 * them. Each names the capability that generic ticketing does not give them — the point
 * of the page is the gap, not the list.
 */
const SEGMENTS = [
  {
    icon: Trophy,
    name: 'Stadiums & arenas',
    need: 'Seat-level inventory, multi-gate entry, tiered hospitality',
    detail:
      'Reserved seating with zones, gates that admit only the ticket types assigned to them, and hospitality sold as inventory rather than bolted on afterwards.',
  },
  {
    icon: Tent,
    name: 'Festivals',
    need: 'Multi-day, multi-stage, capacity zoning',
    detail:
      'Day passes and full-weekend passes from one capacity pool, wristband support, and gate throughput forecasting for the arrival peak.',
  },
  {
    icon: Music,
    name: 'Concert promoters',
    need: 'Allocation to sub-promoters, settlement across parties',
    detail:
      'Give a promoter their own allocation and commission, let them run sub-promoters, and settle organiser, venue, promoter and platform from one waterfall.',
  },
  {
    icon: Trophy,
    name: 'Sports clubs',
    need: 'Season inventory, member priority, recurring fixtures',
    detail:
      'Season passes, member presale windows gated by loyalty tier, and fixture duplication that clones the seat map instead of rebuilding it.',
  },
  {
    icon: Presentation,
    name: 'Conferences',
    need: 'Sessions, speakers, hybrid and livestream attendance',
    detail:
      'Physical, online and livestream tickets from one event, with identical entry validation and identical revenue reporting across all three.',
  },
  {
    icon: Wine,
    name: 'Nightclubs',
    need: 'Fast door throughput, guest lists, table service',
    detail:
      'Scan-and-go entry on multiple devices at once, searchable guest lists, and an emergency blocklist that propagates in seconds.',
  },
  {
    icon: Clapperboard,
    name: 'Theatres',
    need: 'Reserved seating, subscription series, accessibility holds',
    detail:
      'Full seat map editor with obstructed-view tagging, accessible and companion seats held as a first-class allocation, never as a leftover.',
  },
  {
    icon: Church,
    name: 'Places of worship',
    need: 'Free and donation entry, capacity management',
    detail:
      'Free tickets carry no commission at all. Donation tiers let attendees give what they can, and capacity limits stay enforced either way.',
  },
  {
    icon: HeartHandshake,
    name: 'Charity & fundraising',
    need: 'Donation tiers, corporate tables, transparent fees',
    detail:
      'Corporate tables with named guests, deposits and balances, and fees itemised so donors can see exactly what reached the cause.',
  },
  {
    icon: Building2,
    name: 'Corporate & internal',
    need: 'Invite-only, access codes, staff passes',
    detail:
      'Hidden and invite-only ticket types with access codes, staff and press passes, and attendee lists that never leave your organisation.',
  },
  {
    icon: PartyPopper,
    name: 'Parties & celebrations',
    need: 'Birthdays, private hire, a guest count you control',
    detail:
      'Birthday parties, graduations, hen and stag nights, house, day and boat parties. Sell paid entry or issue free places, cap the guest list so a venue is never oversold, and check people in from a phone at the door.',
  },
  {
    icon: Heart,
    name: 'Weddings',
    need: 'Guest lists that are not ticket sales',
    detail:
      'Issue free places to a guest list at no cost to you — free tickets carry no commission. Or let guests contribute towards the day with donation tiers. Every guest gets a QR pass that scans at the door in seconds.',
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
          A VIP package, a general-admission ticket and a livestream pass are the same
          object with different tiers. That is why you can run all three from one event
          instead of running two products and two reconciliations.
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-12 border-primary/30 bg-card/60">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Crown className="h-8 w-8 text-primary" />
          <h2 className="font-headline text-2xl font-bold">
            VIP hospitality runs across every one of them
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            Packages with inclusions, named guest lists, dietary and accessibility
            requirements, deposits and balances, and a concierge workflow — inside the
            same platform that sells your general admission, not a separate product.
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
