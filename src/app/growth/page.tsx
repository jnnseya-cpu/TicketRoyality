import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BadgeCheck, Coins, Megaphone, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';

export const metadata: Metadata = {
  title: 'Growth & Influencers',
  description:
    'Earn 1% of every ticket you sell from 10,000 followers up. Verified on engagement, paid monthly, disclosed properly.',
};

const TIERS = [
  {
    tier: 'Creator',
    followers: '10,000+',
    commission: '1%',
    terms: 'Self-serve. Automatic once your account is verified.',
  },
  {
    tier: 'Partner',
    followers: '100,000+',
    commission: '2%, negotiable',
    terms: 'Manual review and a contract.',
  },
  {
    tier: 'Ambassador',
    followers: 'By invitation',
    commission: 'Negotiated + fee',
    terms: 'Contract, with optional exclusivity.',
  },
];

const STEPS = [
  {
    icon: Users,
    title: 'Connect your account',
    body: 'Sign in with Instagram, TikTok, YouTube or X. We read your follower count and engagement directly from the platform — you never type a number in.',
  },
  {
    icon: BadgeCheck,
    title: 'Get verified',
    body: 'We check engagement rate, not just follower count. 10,000 followers at 4% engagement is worth more than 100,000 at 0.2%, and we price it that way.',
  },
  {
    icon: Megaphone,
    title: 'Share what you actually like',
    body: 'Pick events from the catalogue, get a tracked link and ready-made assets. Every asset ships with the paid-partnership disclosure already in it.',
  },
  {
    icon: Coins,
    title: 'Get paid',
    body: 'You earn 1% of the ticket value you drive. Commission confirms once your audience attends, holds 14 days, then pays out monthly from £25.',
  },
];

export default function GrowthPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Growth &amp; Influencers
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          1% of every ticket you sell
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          From 10,000 followers up. Your commission comes out of our fee — never out of
          the organiser&apos;s margin, so nobody has a reason to switch you off.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register/customer">
              Apply now <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">Talk to the team</Link>
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

      <div className="mt-14">
        <h2 className="font-headline text-2xl font-bold">Tiers</h2>
        <Card className="mt-4">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Followers</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Terms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TIERS.map((tier) => (
                  <TableRow key={tier.tier}>
                    <TableCell className="font-medium">{tier.tier}</TableCell>
                    <TableCell>{tier.followers}</TableCell>
                    <TableCell className="font-semibold text-primary">
                      {tier.commission}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tier.terms}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h2 className="font-headline text-xl font-semibold">
              You have to say it&apos;s an ad
            </h2>
            <p className="text-sm text-muted-foreground">
              A commission arrangement is a material connection, and the ASA in the UK
              and the FTC in the US both require it to be clearly identifiable. Every
              asset we hand you already carries the disclosure — you do not have to
              remember it.
            </p>
            <p className="text-sm text-muted-foreground">
              Post without it and we will tell you the first time. A second time and the
              partnership ends with commission forfeit. It protects you more than it
              protects us.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <Coins className="h-7 w-7 text-primary" />
            <h2 className="font-headline text-xl font-semibold">How payment works</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Attribution</strong> — last click
                within 7 days, on a real click, never an impression.
              </li>
              <li>
                <strong className="text-foreground">Confirmation</strong> — commission
                confirms when your audience is scanned in at the door, not at checkout.
              </li>
              <li>
                <strong className="text-foreground">Hold</strong> — 14 days after the
                event, while refunds and chargebacks settle.
              </li>
              <li>
                <strong className="text-foreground">Payout</strong> — monthly in
                arrears, minimum £25, to your chosen method.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Paying on attendance rather than purchase means we never claw money back
              from you after you have spent it.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-14 border-primary/30 bg-card/60">
        <CardContent className="space-y-3 py-10 text-center">
          <h2 className="font-headline text-2xl font-bold">Refer a friend</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Not a creator? Every account gets a referral link. Your friend saves on their
            first order, and you get credit toward your next ticket once they have
            actually been. Up to ten friends a month.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/customer">Find your link</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
