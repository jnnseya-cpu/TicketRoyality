import Link from 'next/link';
import type { Metadata } from 'next';

import { Separator } from '@/frontend/components/ui/separator';
import {
  ACU_USD_RATE,
  OFFLINE_SERVICE_FEE_PERCENT,
} from '@/shared/constants/billing';
import { ZERO_FEE_CONFIG } from '@/shared/constants/fees';
import { formatCurrency } from '@/shared/utils';

const UK_FEES = ZERO_FEE_CONFIG.countries.GB;

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms governing use of the TicketRoyality platform.',
};

/**
 * The "last updated" value is a build-time constant, not `new Date()`. A live date
 * renders differently on the server and the client and breaks hydration.
 */
const LAST_UPDATED = '5 August 2026';

const SECTIONS: Array<{ heading: string; paragraphs: string[] }> = [
  {
    heading: '1. Who we are and what these terms cover',
    paragraphs: [
      'TicketRoyality ("we", "us", "the platform") provides ticketing and event management software. These terms govern your use of the platform, whether you attend events, organise them, or act on an organiser\'s behalf at the door.',
      'By creating an account, buying a ticket, or publishing an event, you accept these terms. If you are accepting on behalf of a company, you confirm you are authorised to bind that company.',
    ],
  },
  {
    heading: '2. Accounts and eligibility',
    paragraphs: [
      'You must be at least 13 years old to purchase tickets. Organiser accounts are reviewed before their first event may be published, and we may decline or suspend an application at our discretion.',
      'You are responsible for keeping your credentials secure and for all activity under your account. Tell us immediately if you believe your account has been compromised.',
    ],
  },
  {
    heading: '3. The platform is a marketplace, not the promoter',
    paragraphs: [
      'Except where we are explicitly named as the organiser, events are created, priced, staffed and delivered by third-party organisers. The contract to attend an event is between you and that organiser.',
      'Organisers are solely responsible for the accuracy of their listings, for the safety and licensing of their venue, for delivering the event as advertised, and for handling refunds under their stated policy and applicable consumer law.',
    ],
  },
  {
    heading: '4. Tickets, QR codes and entry',
    paragraphs: [
      'Every ticket carries a unique QR code that is valid for one entry to one specific event. Presenting a ticket at a different event, or presenting a code that has already been scanned, will be refused.',
      'Do not share, screenshot for distribution, or resell your QR code. If a code is duplicated, the first scan is admitted and every subsequent scan is refused. We are not liable for a refused entry caused by a code you shared.',
      'Organisers may delegate scanning to staff through a scoped check-in link. That link validates tickets for one event only and grants no access to organiser or customer data.',
    ],
  },
  {
    heading: '5. Payments, fees and payouts',
    paragraphs: [
      `Card payments are processed by Stripe and wallet payments by Bitripay; each is governed by its own terms. Mobile-money payments carry the standard TicketRoyality Service Fee plus a ${OFFLINE_SERVICE_FEE_PERCENT}% mobile-money charge, shown as one total before you pay, and are released only after we verify the transaction reference. Submitting a reference does not itself entitle you to a ticket.`,
      // Built from the live config, never typed by hand. A terms page that names a
      // different fee from the one the engine charges is the same class of failure as a
      // card that names a different price from the checkout.
      `We deduct no commission from your ticket sales. You receive 100% of the face value of every ticket, subject only to refunds, chargebacks, taxes and any deduction required by law. Our revenue is a TicketRoyality Service Fee paid by the ticket buyer — ${UK_FEES.buyerServicePct}% plus ${formatCurrency(UK_FEES.buyerFixedFeeMinor / 100)} per paid ticket, minimum ${formatCurrency((UK_FEES.minimumServiceFeeMinor ?? 0) / 100)}, VAT included — which is shown inside the total price wherever a ticket is advertised and is never added at checkout. Free tickets carry no fee to anyone.`,
      'Payouts are made to the payout method on your account, subject to a minimum balance and to our right to withhold funds where we reasonably suspect fraud, chargeback risk, or an undelivered event.',
    ],
  },
  {
    heading: '6. Refunds and cancellations',
    paragraphs: [
      'Refund policies are set by the organiser and shown before purchase. Where an event is cancelled, materially rescheduled, or not delivered as advertised, the organiser is responsible for refunds and we will facilitate them from funds held.',
      'Service charges on mobile-money payments and paid promotional placements are non-refundable once the placement has run.',
    ],
  },
  {
    heading: '7. Live stream events',
    paragraphs: [
      'For live stream events, the organiser owns and is responsible for all broadcast content, including music licensing, performer clearances and any user-generated content in chat.',
      'A ticket to a live stream grants a personal, non-transferable licence to view. Recording, rebroadcasting or publicly exhibiting the stream is prohibited. We may terminate a stream that breaches these terms or applicable law, without refund to the organiser.',
      'Streams depend on your connection and third-party delivery networks. We do not guarantee uninterrupted playback and are not liable for degraded quality outside our control.',
    ],
  },
  {
    heading: '8. Promotion and paid placement',
    paragraphs: [
      'Homepage video ads, featured placements and newsletter spotlights are paid promotional products. Prices, durations and inventory are shown at purchase. We may decline or remove promotional content that is misleading, unlawful, or inconsistent with the platform.',
      'Paid placement does not affect the integrity of search results, which remain ordered by relevance and, where you have shared it, proximity.',
    ],
  },
  {
    heading: '9. AI features and credit (ACU)',
    paragraphs: [
      `AI features are billed in Access Credit Units. 1 ACU = $${ACU_USD_RATE.toFixed(2)}. Each AI action shows its ACU price before it runs, and the amount charged is rounded up to the next whole ACU. When your balance is exhausted, AI features stop until you top up. Your balance can never go negative.`,
      'AI output is generated text and may be inaccurate. You are responsible for reviewing anything you publish. Do not submit personal data about third parties into AI features.',
      'Credits are non-refundable and non-transferable, and carry no cash value except as required by law.',
    ],
  },
  {
    heading: '10. Acceptable use',
    paragraphs: [
      'Do not use the platform to list unlawful events, launder funds, infringe intellectual property, harass others, scrape data at scale, circumvent ticket limits, or probe our systems without written authorisation.',
      'We may suspend or terminate accounts, cancel listings and void tickets where we reasonably believe this clause has been breached.',
    ],
  },
  {
    heading: '11. Limitation of liability',
    paragraphs: [
      'Nothing in these terms excludes liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be limited.',
      'Subject to that, we are not liable for indirect, incidental, special or consequential loss, nor for loss of profit, revenue, goodwill, anticipated savings, or data, however arising.',
      'Our total aggregate liability arising out of or in connection with the platform in any twelve-month period is limited to the greater of (a) the total fees we retained from you in that period, and (b) £100.',
      'We are not liable for the acts or omissions of organisers, venues, performers, or payment processors, nor for events that are cancelled, curtailed or altered by them.',
    ],
  },
  {
    heading: '12. Indemnity',
    paragraphs: [
      'Organisers agree to indemnify us against claims, losses and reasonable costs arising from their events, their listings, their content, their handling of attendee data, and any breach of these terms.',
    ],
  },
  {
    heading: '13. Changes, governing law and contact',
    paragraphs: [
      'We may update these terms. Material changes will be notified in-product or by email at least 14 days before they take effect. Continuing to use the platform after that constitutes acceptance.',
      'These terms are governed by the laws of England and Wales, and the courts of England and Wales have exclusive jurisdiction.',
      'Questions about these terms: legal@ticketroyality.com.',
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="container max-w-3xl py-14">
      <h1 className="font-headline text-3xl font-bold sm:text-4xl">Terms of service</h1>
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
        <Link href="/privacy-policy" className="text-primary hover:underline">
          privacy policy
        </Link>{' '}
        and{' '}
        <Link href="/how-it-works" className="text-primary hover:underline">
          how the platform works
        </Link>
        .
      </p>
    </div>
  );
}
