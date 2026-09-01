import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Check, Rocket, Ticket, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { DEFAULT_COMMISSION_PERCENT } from '@/shared/constants/billing';

export const metadata: Metadata = {
  title: 'Get started',
  description:
    'Buy a ticket, run an event, or build on the API. Three ways to start with TicketRoyality.',
};

const PATHS = [
  {
    icon: Ticket,
    title: 'I want to go to something',
    body: 'Browse everything on sale, filter by city, date and category, and buy in under thirty seconds. No account needed until after you have paid.',
    cta: { label: 'Browse events', href: '/events' },
    points: [
      'Guest checkout — account optional',
      'Apple Pay, Google Pay, card, mobile money',
      'Tickets in your wallet, ready to scan',
    ],
  },
  {
    icon: Rocket,
    title: 'I want to run events',
    body: 'Create your first event in minutes. Describe it and let the platform build the draft, or fill it in yourself. You review everything before it goes live.',
    cta: { label: 'Create an organiser account', href: '/register/organiser' },
    points: [
      `${DEFAULT_COMMISSION_PERCENT}% commission — you keep 100% of your ticket value`,
      'Free events cost nothing at all',
      'Seat maps, tiers, coupons and door scanning included',
    ],
  },
  {
    icon: Users,
    title: 'I want to promote events',
    body: 'From 10,000 followers you earn 1% of every ticket you sell. Verified on engagement, paid monthly once your audience actually turns up.',
    cta: { label: 'Growth & influencers', href: '/growth' },
    points: [
      '1% of attributed ticket value',
      'Paid from our fee, never the organiser’s',
      'Disclosure built into every asset',
    ],
  },
];

const ORGANISER_STEPS = [
  'Create an account and tell us about your organisation.',
  'We verify you — usually within 24 to 48 hours. You can build in the meantime.',
  'Build your first event, or describe it and review what the platform drafts.',
  'Publish. Your event is live, indexed and shareable straight away.',
  'Scan people in on the night from any phone, on as many gates as you need.',
  'Get paid, with every fee itemised on the statement.',
];

export default function GetStartedPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Get started
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          Where do you want to begin?
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Three ways in. None of them takes longer than a few minutes.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PATHS.map((path) => (
          <Card key={path.title} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-4 pt-6">
              <path.icon className="h-8 w-8 text-primary" />
              <h2 className="font-headline text-xl font-semibold">{path.title}</h2>
              <p className="text-sm text-muted-foreground">{path.body}</p>
              <ul className="flex-1 space-y-2">
                {path.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full">
                <Link href={path.cta.href}>
                  {path.cta.label} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-headline text-2xl font-bold">Running your first event</h2>
          <p className="mt-2 text-muted-foreground">
            Six steps from signing up to being paid. Most organisers publish on day one
            and sell while verification finishes.
          </p>
          <Button asChild className="mt-4">
            <Link href="/how-it-works">
              See how it works <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ol className="divide-y divide-border/60 border-y border-border/60">
              {ORGANISER_STEPS.map((step, index) => (
                <li key={step} className="flex items-baseline gap-4 py-3.5">
                  <span className="font-headline text-lg font-semibold tabular-nums text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-14 border-primary/30 bg-card/60">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <h2 className="font-headline text-2xl font-bold">Still deciding?</h2>
          <p className="max-w-2xl text-muted-foreground">
            Email us at{' '}
            <a
              href="mailto:info@ticketroyality.com"
              className="text-primary underline-offset-4 hover:underline"
            >
              info@ticketroyality.com
            </a>{' '}
            and tell us what you are trying to run. We will tell you honestly whether we
            are the right fit.
          </p>
          <Button asChild variant="outline">
            <Link href="/contact">Contact us</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
