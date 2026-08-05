import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Crown,
  QrCode,
  Radio,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  DEFAULT_ADMIN_FEE,
  DEFAULT_COMMISSION_PERCENT,
  MARKUP_MULTIPLIER,
  OFFLINE_SERVICE_FEE_PERCENT,
  WELCOME_BONUS_ACU,
} from '@/shared/constants/billing';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How TicketRoyality works for attendees and organisers — discovery, secure QR ticketing, door check-in, payments, promotion and payouts.',
};

const ATTENDEE_STEPS = [
  {
    icon: Search,
    title: 'Find something worth going to',
    body: 'Search worldwide by name, or share your location and see what is on within 10 miles — the radius widens to 20 then 30 if nothing is close. Filter by category, free events, online events and live streams, or switch to the calendar and pick a date.',
  },
  {
    icon: Sparkles,
    title: 'Get recommendations that make sense',
    body: 'Our AI reads the categories you browse and attend and surfaces events you would actually book. If the model is busy, you still get interest-matched picks rather than an error.',
  },
  {
    icon: CreditCard,
    title: 'Check out how you like',
    body: `Card via Stripe, wallet via Bitripay, or mobile money for Congolese customers — Vodacom, Airtel, Orange and Africell, with a ${OFFLINE_SERVICE_FEE_PERCENT}% service charge and admin verification before the ticket is released.`,
  },
  {
    icon: QrCode,
    title: 'Keep every ticket in one place',
    body: 'Each ticket carries a unique QR code bound to that event, plus your name, tier, seat, price and venue. Download it, print it, or show it on your phone at the gate.',
  },
];

const ORGANISER_STEPS = [
  {
    icon: Ticket,
    title: 'Build the event',
    body: 'Tiered pricing (early bird, general, VIP, hospitality), colour-coded seating sections with lettered rows and automatic seat labels, speakers, recurring series, and physical, online or live stream formats.',
  },
  {
    icon: ScanLine,
    title: 'Run the door without exposing your books',
    body: 'Share a scoped check-in link with gate staff. It validates tickets for that one event and nothing else — no sales figures, no customer records, no access to your other events.',
  },
  {
    icon: ShieldCheck,
    title: 'Reject what should be rejected',
    body: 'A ticket for a different event is refused. A ticket already scanned is refused. Results are colour-coded so a volunteer can read them across a noisy foyer.',
  },
  {
    icon: BarChart3,
    title: 'Watch the numbers move',
    body: 'Gross and net sales, orders, commission withheld and running balance, with per-event and per-category breakdowns. Every table exports to CSV.',
  },
  {
    icon: Crown,
    title: 'Buy your way to the front',
    body: 'Purchase a homepage video ad slot, a featured event placement or a newsletter spotlight directly from your dashboard.',
  },
  {
    icon: Radio,
    title: 'Stream it',
    body: 'Live stream events get their own filter, a player on the event page, and the data model for chat, polling and on-demand replay.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container max-w-5xl py-14">
      <div className="mb-12 text-center">
        <Badge variant="gold" className="mb-3">
          How it works
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">
          From first sale to <span className="text-royal">final scan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          TicketRoyality is a premium ticketing and event management platform. Attendees get a
          faster, safer way to buy. Organisers get total control over inventory, entry and revenue.
        </p>
      </div>

      <section className="mb-14">
        <h2 className="mb-6 font-headline text-2xl font-bold">For attendees</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {ATTENDEE_STEPS.map((step, index) => (
            <Card key={step.title}>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-headline text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-headline text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="my-12" />

      <section className="mb-14">
        <h2 className="mb-6 font-headline text-2xl font-bold">For organisers</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ORGANISER_STEPS.map((step) => (
            <Card key={step.title}>
              <CardContent className="p-6">
                <step.icon className="mb-3 h-5 w-5 text-primary" />
                <h3 className="font-headline text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="my-12" />

      <section id="pricing" className="mb-14">
        <h2 className="mb-2 font-headline text-2xl font-bold">What it costs</h2>
        <p className="mb-6 text-muted-foreground">
          No monthly fee to publish. We take a cut of what you sell, and nothing when you sell
          nothing.
        </p>

        <div className="grid gap-5 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <CreditCard className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-headline text-base font-semibold">Ticket commission</h3>
              <p className="mt-2 font-headline text-2xl font-bold text-primary">
                {DEFAULT_COMMISSION_PERCENT}% + {formatCurrency(DEFAULT_ADMIN_FEE)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Per ticket sold. Bespoke rates available for high-volume partners.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Smartphone className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-headline text-base font-semibold">Mobile money</h3>
              <p className="mt-2 font-headline text-2xl font-bold text-primary">
                {OFFLINE_SERVICE_FEE_PERCENT}%
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Service charge on offline mobile-money payments, paid by the customer.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Wallet className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-headline text-base font-semibold">AI credit (ACU)</h3>
              <p className="mt-2 font-headline text-2xl font-bold text-primary">
                Cost × {MARKUP_MULTIPLIER}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every account starts with {WELCOME_BONUS_ACU} ACU free. Top up in $3, $6 or $9
                packages.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-8 text-center">
        <h2 className="font-headline text-2xl font-bold">Ready to sell?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Set up your first event in a few minutes. You control when it goes live.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="royal" asChild>
            <Link href="/register/organiser">
              Launch your event <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
