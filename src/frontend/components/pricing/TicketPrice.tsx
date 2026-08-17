import * as React from 'react';

import { allInTicketPriceMinor, serviceFeeForTicket, toMajor, toMinor } from '@/shared/fees';
import { ZERO_FEE_CONFIG } from '@/shared/constants/fees';
import { cn, formatCurrency } from '@/shared/utils';

/**
 * The only way a ticket price reaches a buyer.
 *
 * ## Why a component and not a helper
 *
 * UK price-transparency rules require a mandatory fee to be inside the first price a
 * buyer sees, on every surface — card, search result, event page, share preview, email.
 * The CMA can fine up to 10% of worldwide turnover or £300,000, whichever is greater,
 * and does not have to prove anyone was harmed.
 *
 * A helper can be forgotten. A component that takes `faceMinor` and has no prop for
 * "show the face value instead" cannot be misused into a violation: there is no
 * arrangement of these props that renders a bare face value next to a Buy button. That
 * is the whole design. If a future surface needs a price, it uses this, and it is
 * compliant by construction rather than by review.
 *
 * ## What it shows
 *
 * The all-in total, prominently, and the breakdown underneath — including the line no
 * competitor can print: the organiser receives 100% of the face value.
 */

export interface TicketPriceProps {
  /** Face value in minor units. The component adds the fee; callers never do. */
  faceMinor: number;
  currency?: string;
  countryCode?: string;
  /** `from` prefixes a catalogue "from £x" lead price. */
  variant?: 'lead' | 'exact';
  /** Show the fee breakdown underneath. Off on dense cards, on wherever there is room. */
  showBreakdown?: boolean;
  className?: string;
}

/** The all-in price as a formatted string, for a `<title>`, an OG tag or an email. */
export function allInPriceLabel(
  faceMinor: number,
  currency = 'GBP',
  countryCode?: string
): string {
  if (faceMinor <= 0) return 'Free';
  return formatCurrency(toMajor(allInTicketPriceMinor(faceMinor, { countryCode })), currency);
}

/** Convenience for the many call sites still carrying float pounds. */
export function allInPriceLabelFromMajor(price: number, currency = 'GBP'): string {
  return allInPriceLabel(toMinor(price), currency);
}

export function TicketPrice({
  faceMinor,
  currency = 'GBP',
  countryCode,
  variant = 'exact',
  showBreakdown = false,
  className,
}: TicketPriceProps) {
  if (faceMinor <= 0) {
    return <span className={cn('font-semibold', className)}>Free</span>;
  }

  const fee = serviceFeeForTicket(
    faceMinor,
    ZERO_FEE_CONFIG.countries[countryCode ?? ZERO_FEE_CONFIG.defaultCountry]
  );
  const total = allInTicketPriceMinor(faceMinor, { countryCode });

  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span className="font-semibold">
        {variant === 'lead' && <span className="font-normal text-muted-foreground">From </span>}
        {formatCurrency(toMajor(total), currency)}
      </span>
      {showBreakdown && (
        <span className="text-xs font-normal text-muted-foreground">
          {formatCurrency(toMajor(faceMinor), currency)} ticket +{' '}
          {formatCurrency(toMajor(fee), currency)} TicketRoyality Service Fee · organiser
          receives {formatCurrency(toMajor(faceMinor), currency)}
        </span>
      )}
    </span>
  );
}
