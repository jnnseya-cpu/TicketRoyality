import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Cpu, Globe, ShieldCheck } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'TicketRoyality builds premium ticketing for stadiums, festivals, clubs and VIP events.',
};

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: 'A ticket is a promise',
    body: 'One code, one entry, one event. Every scan is checked and redeemed inside a single database transaction, so a ticket that has already been through the gate is refused — including when two doors scan it at the same instant.',
  },
  {
    icon: Cpu,
    title: 'Automate the boring parts',
    body: 'Marketing copy, recommendations and similar-event discovery are generated on demand. Organisers spend their time on the event, not on the spreadsheet.',
  },
  {
    icon: Globe,
    title: 'Meet people where they pay',
    body: 'Cards today, with mobile money for the Congolese corridor — Vodacom, Airtel, Orange and Africell — built and awaiting its commercial go-live. A great event should not be gated by a payment method.',
  },
];

/*
 * The team section is deliberately absent.
 *
 * It used to list four people — a chief executive, a head of product, a head of
 * engineering and a head of partnerships — with placeholder avatars. None of them
 * exist. They were invented names presented on a live public site as the executive team
 * of a real company, which is not a placeholder in the sense a grey image is: a
 * prospective organiser could have referenced "your Head of Partnerships" in a
 * conversation, and a journalist could have tried to contact one.
 *
 * Removed rather than replaced with different invented names. It goes back when there
 * are real people to name.
 */
export default function AboutUsPage() {
  return (
    <div className="container max-w-5xl py-14">
      <div className="mb-12 text-center">
        <Badge variant="gold" className="mb-3">
          About us
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">
          We build the ticketing behind <span className="text-royal">great nights out</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          TicketRoyality exists because the gap between a brilliant event and a chaotic one is
          usually operational, not creative. We make the operational part disappear.
        </p>
      </div>

      <div className="relative mb-14 aspect-[21/9] overflow-hidden rounded-xl gold-ring">
        <Image
          src={PLACEHOLDER_IMAGES.aboutTeam}
          alt="TicketRoyality"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      <section className="mb-14">
        <h2 className="mb-6 font-headline text-2xl font-bold">What we believe</h2>
        <div className="grid gap-x-14 border-t border-border/60 sm:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <div
              key={principle.title}
              className="flex gap-5 border-t border-border/60 py-6 first:border-t-0"
            >
              <span className="pt-1 font-mono text-xs tabular-nums text-primary/80">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <principle.icon className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="font-headline text-lg font-semibold leading-tight">
                    {principle.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {principle.body}
                </p>
              </div>
            </div>
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
