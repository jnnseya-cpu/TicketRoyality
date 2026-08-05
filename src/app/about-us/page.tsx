import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Globe, ShieldCheck, Sparkles } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { PLACEHOLDER_IMAGES, avatarSeed } from '@/shared/constants/placeholder-images';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'TicketRoyality builds premium ticketing infrastructure for stadiums, festivals, clubs and VIP events.',
};

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: 'A ticket is a promise',
    body: 'One code, one entry, one event. If a ticket has been copied, resold outside the platform or already scanned, it is refused at the gate — every time, in under a fifth of a second.',
  },
  {
    icon: Sparkles,
    title: 'Automate the boring parts',
    body: 'Marketing copy, recommendations and similar-event discovery are generated on demand. Organisers spend their time on the event, not on the spreadsheet.',
  },
  {
    icon: Globe,
    title: 'Meet people where they pay',
    body: 'Card, crypto wallet and mobile money — including Vodacom, Airtel, Orange and Africell — because a great event should not be gated by a payment method.',
  },
];

const TEAM = [
  { name: 'Amara Bennett', role: 'Chief Executive', seed: 'amara' },
  { name: 'Idris Kaur', role: 'Head of Product', seed: 'idris' },
  { name: 'Sofia Lindqvist', role: 'Head of Engineering', seed: 'sofia' },
  { name: 'Tomás Herrera', role: 'Head of Partnerships', seed: 'tomas' },
];

export default function AboutUsPage() {
  return (
    <div className="container max-w-5xl py-14">
      <div className="mb-12 text-center">
        <Badge variant="gold" className="mb-3">
          About us
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">
          We build the infrastructure behind <span className="text-royal">great nights out</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          TicketRoyality exists because the gap between a brilliant event and a chaotic one is
          usually operational, not creative. We make the operational part disappear.
        </p>
      </div>

      <div className="relative mb-14 aspect-[21/9] overflow-hidden rounded-xl gold-ring">
        <Image
          src={PLACEHOLDER_IMAGES.aboutTeam}
          alt="A full house at a live event"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      <section className="mb-14">
        <h2 className="mb-6 font-headline text-2xl font-bold">What we believe</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <Card key={principle.title}>
              <CardContent className="p-6">
                <principle.icon className="mb-3 h-6 w-6 text-primary" />
                <h3 className="font-headline text-base font-semibold">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {principle.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="mb-6 font-headline text-2xl font-bold">The team</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <Card key={member.name}>
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="relative h-20 w-20 overflow-hidden rounded-full bg-muted">
                  <Image
                    src={avatarSeed(member.seed)}
                    alt={member.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-8 text-center">
        <h2 className="font-headline text-2xl font-bold">Work with us</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Whether you run one club night a month or a 90,000-seat stadium, the platform scales to
          you.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="royal" asChild>
            <Link href="/register/organiser">
              Become an organiser <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/how-it-works">See how it works</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
