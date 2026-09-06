import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BadgeCheck, Coins, Megaphone, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';

export const metadata: Metadata = {
  title: 'Growth & Promoters',
  description:
    'Promote the events you love and earn the commission the organiser sets — tracked on a fair, first-party link, recorded to the penny, disclosed properly.',
};

/**
 * This page describes the promoter/referral tool that actually exists in
 * `backend/services/partners.ts`: an organiser hands out a tracked `/r/CODE` link with a
 * commission they set, the platform counts the clicks and sales and records exactly what is
 * owed, and the ORGANISER pays the promoter directly — the platform never moves that money.
 *
 * It deliberately does NOT promise a self-serve influencer programme (social sign-in,
 * follower/engagement reading, follower-count tiers, or platform-paid monthly payouts): none
 * of that is built, and the partner page already states plainly that the organiser pays.
 */
const STEPS = [
  {
    icon: Users,
    title: 'An organiser gives you a link',
    body: 'A tracked link — ticketroyality.com/r/YOURCODE — set up by the organiser running the event, with a commission they decide. It sets a first-party cookie and redirects. No pixel, no fingerprinting, no cross-site tracking.',
  },
  {
    icon: Megaphone,
    title: 'Share what you actually like',
    body: 'Post your link to the events you would recommend anyway. A click is a click, never an impression, and the last click within seven days before a purchase is the one that counts.',
  },
  {
    icon: BadgeCheck,
    title: 'Your sales are counted, fairly',
    body: 'Commission is worked out from the stored link when the payment lands — on face value, not the buyer’s total. A link scoped to one event earns on that event only, and an order that runs past your allocation earns on the part inside it, never rounded in your favour.',
  },
  {
    icon: Coins,
    title: 'The organiser pays you',
    body: 'TicketRoyality records exactly what you are owed, with an audit row per order, and the organiser pays you directly — we do not move that money. You can see your own numbers any time at a private link, with no account and no buyer names.',
  },
];

export default function GrowthPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Growth &amp; Promoters
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          Earn on the events you promote
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          An organiser gives you a tracked link with a commission they set. Every click and sale
          is counted for you — honestly, on face value — and the organiser pays you directly. We
          keep the record.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/contact">
              Talk to the team <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register/organiser">Run events? Give your promoters a link</Link>
          </Button>
        </div>
      </div>

      <div className="mt-14 grid gap-x-14 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <div
            key={step.title}
            className="flex gap-5 border-t border-border/60 py-6 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
          >
            <span className="pt-1 font-mono text-xs tabular-nums text-primary/80">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <step.icon className="h-4 w-4 shrink-0 text-primary" />
                <h2 className="font-headline text-lg font-semibold leading-tight">{step.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h2 className="font-headline text-xl font-semibold">You have to say it&apos;s an ad</h2>
            <p className="text-sm text-muted-foreground">
              A commission arrangement is a material connection, and the ASA in the UK and the
              FTC in the US both require it to be clearly identifiable. When you post your link,
              label the post as a paid partnership — a simple &ldquo;#ad&rdquo; or the platform&apos;s
              own paid-partnership tag is enough.
            </p>
            <p className="text-sm text-muted-foreground">
              It protects you more than it protects us: an undisclosed paid post is the
              creator&apos;s liability, not the brand&apos;s.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <Coins className="h-7 w-7 text-primary" />
            <h2 className="font-headline text-xl font-semibold">How the commission is counted</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Attribution</strong> — the last real click
                within seven days, never an impression.
              </li>
              <li>
                <strong className="text-foreground">Base</strong> — a percentage of face value,
                set by the organiser, not of the service fee the buyer paid.
              </li>
              <li>
                <strong className="text-foreground">Recorded</strong> — the moment the payment is
                confirmed, with an audit row per order, idempotent so a retry never counts twice.
              </li>
              <li>
                <strong className="text-foreground">Paid</strong> — by the organiser directly,
                from their own take. TicketRoyality records what is owed; it does not hold or
                move your commission.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              You see your clicks, sales and the amount owed on a private, read-only link — no
              login, and no access to the buyers behind the numbers.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-14 border-primary/30 bg-card/60">
        <CardContent className="space-y-3 py-10 text-center">
          <h2 className="font-headline text-2xl font-bold">Refer a friend</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Not promoting for an organiser? Every account still gets a personal referral link.
            Share it, and the sales it brings in are tracked to you the same honest way.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/customer">Find your link</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
