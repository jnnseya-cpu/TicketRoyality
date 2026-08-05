import Link from 'next/link';
import type { Metadata } from 'next';

import { Separator } from '@/frontend/components/ui/separator';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What data TicketRoyality collects, why, and what control you have over it.',
};

const LAST_UPDATED = '5 August 2026';

const SECTIONS: Array<{ heading: string; paragraphs: string[] }> = [
  {
    heading: '1. Who controls your data',
    paragraphs: [
      'TicketRoyality is the data controller for your account, your purchases and your use of the platform. Where an organiser receives attendee data for an event you booked, that organiser is a separate controller for their own use of it.',
      'Contact our data protection team at privacy@ticketroyality.com.',
    ],
  },
  {
    heading: '2. What we collect',
    paragraphs: [
      'Account data: name, email, phone, date of birth (to verify the minimum age of 13) and billing address.',
      'Organiser data: company name, registered address, website, branding assets, social handles and payout details.',
      'Event data: everything you publish, including titles, descriptions, pricing tiers, seating maps, venue coordinates and speaker profiles.',
      'Transaction data: tickets purchased, tier, price, currency, payment provider, and — for mobile-money payments — the transaction reference you submit.',
      'Entry data: when and whether a ticket was scanned at the door.',
      'Technical data: IP address, device and browser information, and pages viewed.',
      'Location data: only if you explicitly tap "Use my location". We use the coordinates to rank nearby events and we do not store them on our servers.',
    ],
  },
  {
    heading: '3. Why we use it and on what legal basis',
    paragraphs: [
      'To perform our contract with you: creating your account, issuing and validating tickets, processing payments and paying out organisers.',
      'For our legitimate interests: preventing fraud and duplicate ticket use, securing the platform, improving discovery and recommendations, and analysing aggregate performance.',
      'With your consent: geolocation, marketing email, and any optional AI feature you choose to run.',
      'To meet legal obligations: tax and accounting records, and responding to lawful requests.',
    ],
  },
  {
    heading: '4. AI features',
    paragraphs: [
      'When you use an AI feature, the text you supply is sent to our model provider to generate a response. We do not send your payment details, address or date of birth.',
      'Do not paste personal data about other people into AI features. Generated output is stored with your account so you can revisit it.',
    ],
  },
  {
    heading: '5. Who we share it with',
    paragraphs: [
      'Organisers: your name, email and ticket details for events you have booked, so they can admit you and contact you about that event.',
      'Payment processors: Stripe and Bitripay receive the data needed to take payment. We never store full card numbers.',
      'Infrastructure providers: Google Firebase for authentication, database and hosting; Google Maps for static venue maps.',
      'Authorities: where we are legally required to disclose, or to establish or defend legal claims.',
      'We do not sell your personal data.',
    ],
  },
  {
    heading: '6. How long we keep it',
    paragraphs: [
      'Account data is kept while your account is open and for 30 days after you request deletion, to allow recovery from mistaken deletion.',
      'Transaction and ticket records are kept for seven years to meet tax and accounting obligations, even after account deletion.',
      'Technical logs are kept for 90 days.',
    ],
  },
  {
    heading: '7. Your rights',
    paragraphs: [
      'You can access, correct, export, restrict or object to the processing of your data, and in most cases request its erasure. Account details are editable directly from your dashboard.',
      'Where processing is based on consent, you can withdraw it at any time without affecting processing already carried out.',
      'You can complain to your local supervisory authority. In the UK that is the Information Commissioner\'s Office.',
    ],
  },
  {
    heading: '8. Security',
    paragraphs: [
      'Data is encrypted in transit and at rest. Access is governed by role-based security rules enforced at the database, so an account can only read the records it owns.',
      'Door-staff check-in links are deliberately scoped to a single event and expose no customer or financial data.',
    ],
  },
  {
    heading: '9. International transfers and changes',
    paragraphs: [
      'Some providers process data outside the UK/EEA. Where they do, transfers are covered by adequacy decisions or standard contractual clauses.',
      'We will notify you of material changes to this policy in-product or by email before they take effect.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="container max-w-3xl py-14">
      <h1 className="font-headline text-3xl font-bold sm:text-4xl">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <Separator className="my-8" />

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="font-headline text-lg font-semibold">{section.heading}</h2>
            <div className="mt-3 space-y-3">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Separator className="my-8" />

      <p className="text-sm text-muted-foreground">
        See also our{' '}
        <Link href="/terms-of-service" className="text-primary hover:underline">
          terms of service
        </Link>
        .
      </p>
    </div>
  );
}
