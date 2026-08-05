import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText, Mail } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';

export const metadata: Metadata = {
  title: 'All policies',
  description:
    'Every policy in one place — terms, privacy, cookies, refunds, acceptable use, creator programme terms, security disclosure and accessibility.',
};

const LIVE = [
  {
    title: 'Terms of Service',
    href: '/terms-of-service',
    body: 'The agreement between you and TicketRoyality — accounts, purchases, organiser obligations, commission and liability.',
  },
  {
    title: 'Privacy Policy',
    href: '/privacy-policy',
    body: 'What personal data we hold, why, how long for, who it is shared with, and how to exercise your rights.',
  },
];

/**
 * Policies still being drafted. Listing them with an honest status is better than
 * linking to pages that do not exist, and better than pretending the set is complete.
 */
const DRAFTING = [
  {
    title: 'Cookie Policy',
    body: 'Every cookie and similar technology, what it does, and how to refuse the non-essential ones.',
  },
  {
    title: 'Refund & Cancellation Policy',
    body: 'Platform-level rules, and how an organiser’s own refund policy interacts with them.',
  },
  {
    title: 'Acceptable Use Policy',
    body: 'What may and may not be sold or promoted through the platform, and how we enforce it.',
  },
  {
    title: 'Creator Programme Terms',
    body: 'Commission, verification, disclosure obligations, fraud rules and payout conditions.',
  },
  {
    title: 'Organiser Agreement',
    body: 'Payouts, chargebacks, cancellation obligations and data responsibilities for organisers.',
  },
  {
    title: 'Security Disclosure Policy',
    body: 'How to report a vulnerability, what we commit to, and our safe-harbour position for good-faith research.',
  },
  {
    title: 'Accessibility Statement',
    body: 'Our conformance target, known gaps, and how to tell us when something is not usable.',
  },
  {
    title: 'Data Processing Addendum',
    body: 'For organisers and partners who process personal data through the platform.',
  },
];

export default function PoliciesPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Legal
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">All policies</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything in one place, including the ones we have not finished yet.
        </p>
      </div>

      <div className="mt-12">
        <h2 className="font-headline text-xl font-semibold">In force</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {LIVE.map((policy) => (
            <Card key={policy.href}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-headline text-lg font-semibold">{policy.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{policy.body}</p>
                <Button asChild variant="link" className="px-0">
                  <Link href={policy.href}>Read</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <h2 className="font-headline text-xl font-semibold">Being drafted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Listed here so you know they are coming, and what they will cover. Until each
          is published, the Terms of Service and Privacy Policy govern.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DRAFTING.map((policy) => (
            <Card key={policy.title} className="border-dashed">
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-headline text-base font-semibold">{policy.title}</h3>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    Drafting
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{policy.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="mt-12 border-primary/30 bg-card/60">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Mail className="h-7 w-7 text-primary" />
          <h2 className="font-headline text-xl font-semibold">
            Questions about any of this?
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Data access, correction, deletion and portability requests are answered
            within 30 days.
          </p>
          <Button asChild variant="outline">
            <a href="mailto:info@ticketroyality.com?subject=Policy%20enquiry">
              info@ticketroyality.com
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
