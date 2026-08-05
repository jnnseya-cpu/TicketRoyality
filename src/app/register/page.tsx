import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Crown, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Join TicketRoyality as an attendee or as an event organiser.',
};

const OPTIONS = [
  {
    icon: Ticket,
    title: 'I want to attend events',
    description:
      'Buy tickets, keep every QR code in one place, get AI recommendations and manage your payment methods.',
    href: '/register/customer',
    cta: 'Create a customer account',
    variant: 'outline' as const,
  },
  {
    icon: Crown,
    title: 'I want to run events',
    description:
      'Publish events, sell tiered and VIP tickets, run door check-in, buy promotion and track revenue in real time.',
    href: '/register/organiser',
    cta: 'Apply as an organiser',
    variant: 'royal' as const,
  },
];

export default function RegisterChoicePage() {
  return (
    <div className="container max-w-4xl py-16">
      <div className="mb-10 text-center">
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">Join TicketRoyality</h1>
        <p className="mt-3 text-muted-foreground">Choose the account that fits what you do.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {OPTIONS.map((option) => (
          <Card key={option.href} className="flex flex-col">
            <CardHeader>
              <option.icon className="mb-2 h-7 w-7 text-primary" />
              <CardTitle>{option.title}</CardTitle>
              <CardDescription>{option.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button variant={option.variant} className="w-full" asChild>
                <Link href={option.href}>
                  {option.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
