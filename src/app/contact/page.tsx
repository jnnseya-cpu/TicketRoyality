import Link from 'next/link';
import type { Metadata } from 'next';
import { Building2, LifeBuoy, Mail, ShieldAlert, Sparkles } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with TicketRoyality. General enquiries, support, partnerships, press and security disclosure.',
};

const CONTACT_EMAIL = 'info@ticketroyality.com';

/**
 * Every route reaches the same inbox. Publishing one address that is answered beats
 * publishing six that are not — routing happens on our side, not the sender's.
 */
const ROUTES = [
  {
    icon: LifeBuoy,
    title: 'Support',
    body: 'Something wrong with an order, a ticket or a payout. Include your order or event reference and we can answer in one reply instead of three.',
  },
  {
    icon: Building2,
    title: 'Sales & partnerships',
    body: 'Running events at scale, a venue, a promoter network, or a white-label deployment. Tell us roughly how many events a year and where.',
  },
  {
    icon: Sparkles,
    title: 'Press & media',
    body: 'Interviews, data requests and our annual ticket-pricing report. We publish our own figures and will share the methodology.',
  },
  {
    icon: ShieldAlert,
    title: 'Security disclosure',
    body: 'Found a vulnerability? Report it here and we will acknowledge within one working day. We do not take legal action against good-faith research.',
  },
];

export default function ContactPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Contact
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">Talk to us</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          One address, answered by people. Whatever it is about, this reaches us.
        </p>

        <Card className="mx-auto mt-8 max-w-xl border-primary/30 bg-card/60">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <Mail className="h-8 w-8 text-primary" />
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-headline text-xl font-semibold text-primary underline-offset-4 hover:underline sm:text-2xl"
            >
              {CONTACT_EMAIL}
            </a>
            <p className="text-sm text-muted-foreground">
              We aim to reply within one working day.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {ROUTES.map((route) => (
          <Card key={route.title}>
            <CardContent className="space-y-3 pt-6">
              <route.icon className="h-7 w-7 text-primary" />
              <h2 className="font-headline text-lg font-semibold">{route.title}</h2>
              <p className="text-sm text-muted-foreground">{route.body}</p>
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(route.title)}`}>
                  Email us
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-headline text-lg font-semibold">Already have an account?</h2>
            <p className="text-sm text-muted-foreground">
              Your dashboard has your orders, tickets and payout history — usually faster
              than asking us.
            </p>
            <Button asChild variant="link" className="px-0">
              <Link href="/dashboard/customer">Go to your dashboard</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-headline text-lg font-semibold">Building on the API?</h2>
            <p className="text-sm text-muted-foreground">
              Documentation, sandbox keys and webhook testing are in the developer
              centre.
            </p>
            <Button asChild variant="link" className="px-0">
              <Link href="/developers">Developer centre</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-headline text-lg font-semibold">Data or privacy request?</h2>
            <p className="text-sm text-muted-foreground">
              Access, correction, deletion and portability requests are handled within 30
              days.
            </p>
            <Button asChild variant="link" className="px-0">
              <Link href="/policies">All policies</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
