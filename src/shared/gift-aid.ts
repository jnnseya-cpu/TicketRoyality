/**
 * Gift Aid.
 *
 * ## The rule that shapes everything below
 *
 * Gift Aid is claimed on a **gift**, never on a payment for goods or services. A ticket
 * to a gala dinner is a payment for admission and a meal, so **no Gift Aid can be claimed
 * on a ticket price** — not on part of it, not on the "excess over cost". The narrow
 * exception in the legislation is admission to view charity property (a heritage site
 * charging 10% more than standard admission, or selling a twelve-month pass), which is
 * not what this platform sells.
 *
 * So the model here is deliberately blunt: a donation is a separate amount from a ticket,
 * and only the donation is ever claimable. A charity that claims on ticket income and is
 * audited repays the lot with interest, and the finance officer who signed the claim is
 * the person who carries it. Making that structurally impossible is worth more than any
 * convenience.
 *
 * ## What still needs a human
 *
 * The rates and thresholds below are the current ones and they change. Nothing here is
 * tax advice, and a charity's own accountant signs off a claim — this produces the
 * schedule and the arithmetic, it does not decide entitlement.
 */

/**
 * Basic rate relief: a £10 gift from a taxpayer who has paid basic-rate tax was £12.50
 * gross, and the charity reclaims the £2.50. That is 25% of the gift, which is where the
 * familiar number comes from.
 */
export const GIFT_AID_RATE = 0.25;

/** Below this a declaration is not worth the record-keeping, and HMRC allows aggregation. */
export const AGGREGATION_CEILING_MINOR = 2000;

/**
 * What the charity can reclaim on a gift, in minor units.
 *
 * **Rounded down, always.** A claim for a penny more than the entitlement is an incorrect
 * claim; a penny less is a penny. The asymmetry is the whole reason this is not `Math.round`.
 */
export function giftAidOnMinor(donationMinor: number): number {
  if (!Number.isFinite(donationMinor) || donationMinor <= 0) return 0;
  return Math.floor(donationMinor * GIFT_AID_RATE);
}

/**
 * The most a donor may receive back before the gift stops being a gift.
 *
 * HMRC's relevant-value test: up to £100 the benefit may be a quarter of the donation;
 * above that it is £25 plus 5% of the excess, and no benefit may exceed £2,500. A
 * fundraising dinner where the donor gets a £60 meal for a £100 "donation" is not a
 * donation, and this is the arithmetic that says so before the claim is filed rather
 * than after it is queried.
 */
export function benefitLimitMinor(donationMinor: number): number {
  if (donationMinor <= 0) return 0;

  const HUNDRED_POUNDS = 10_000;
  const OVERALL_CAP = 250_000;

  const limit =
    donationMinor <= HUNDRED_POUNDS
      ? donationMinor * 0.25
      : HUNDRED_POUNDS * 0.25 + (donationMinor - HUNDRED_POUNDS) * 0.05;

  return Math.min(Math.floor(limit), OVERALL_CAP);
}

export interface DeclarationInput {
  /** The donor's own name. HMRC needs a first name and a surname, not a display name. */
  firstName: string;
  lastName: string;
  /** House name or number — the numeric part of the address is what HMRC matches on. */
  addressLine: string;
  postcode: string;
  /** The donor confirming they pay enough UK tax to cover what is reclaimed. */
  confirmedTaxpayer: boolean;
}

export type DeclarationProblem =
  | 'no-first-name'
  | 'no-last-name'
  | 'no-address'
  | 'bad-postcode'
  | 'not-confirmed';

/**
 * UK postcode, loosely but not carelessly.
 *
 * Deliberately not the full BS 7666 monster: this rejects what is obviously not a
 * postcode and accepts what is obviously one, because a donor mistyping their own
 * postcode is a correction, while a validator that rejects a real postcode loses the
 * declaration and the claim with it.
 */
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function normalisePostcode(value: string): string {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) return compact;
  // The inward code is always the last three characters; the space goes before them.
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function checkDeclaration(input: DeclarationInput): DeclarationProblem[] {
  const problems: DeclarationProblem[] = [];

  if (!input.firstName?.trim()) problems.push('no-first-name');
  if (!input.lastName?.trim()) problems.push('no-last-name');
  if (!input.addressLine?.trim()) problems.push('no-address');
  if (!POSTCODE.test(input.postcode ?? '')) problems.push('bad-postcode');
  // The confirmation is the declaration. Without it there is nothing to keep.
  if (!input.confirmedTaxpayer) problems.push('not-confirmed');

  return problems;
}

/**
 * The wording the donor agreed to, stored with every declaration.
 *
 * Kept as a versioned constant rather than living only in a form, because in an audit the
 * question is what *this donor* was shown on the day, and a component that has been
 * edited since cannot answer it. A change here is a new version, and old declarations
 * keep pointing at the old text.
 */
export const DECLARATION_VERSION = '2026-01';

export const DECLARATION_TEXT =
  'I want to Gift Aid this donation and any donations I make in the future or have made ' +
  'in the past 4 years to this charity. I am a UK taxpayer and understand that if I pay ' +
  'less Income Tax and/or Capital Gains Tax than the amount of Gift Aid claimed on all my ' +
  'donations in that tax year it is my responsibility to pay any difference.';

export interface ClaimableDonation {
  id: string;
  donatedAt: string;
  amountMinor: number;
  /** Anything the donor received in return, valued honestly. Usually nothing. */
  benefitMinor?: number;
  declaration?: {
    firstName: string;
    lastName: string;
    addressLine: string;
    postcode: string;
    /** When the declaration was made. A gift before it only counts if it is enduring. */
    madeAt: string;
    enduring: boolean;
  } | null;
}

export type Ineligibility = 'no-declaration' | 'benefit-too-large' | 'before-declaration';

/**
 * Why a donation cannot be claimed, or `null` if it can.
 *
 * Separated from the totalling so a charity can see the reason per donation. "£4,000
 * claimable" is useful; "£4,000 claimable, £600 not because eleven donors never completed
 * a declaration" is the version somebody can act on by sending eleven emails.
 */
export function ineligibility(donation: ClaimableDonation): Ineligibility | null {
  const declaration = donation.declaration;
  if (!declaration) return 'no-declaration';

  if ((donation.benefitMinor ?? 0) > benefitLimitMinor(donation.amountMinor)) {
    return 'benefit-too-large';
  }

  /*
   * A one-off declaration covers the gift it was made for and nothing earlier. An
   * enduring one reaches back four years, which is the point of asking.
   */
  if (!declaration.enduring && donation.donatedAt < declaration.madeAt.slice(0, 10)) {
    return 'before-declaration';
  }

  if (declaration.enduring) {
    const fourYearsBefore = new Date(declaration.madeAt);
    fourYearsBefore.setFullYear(fourYearsBefore.getFullYear() - 4);
    if (new Date(donation.donatedAt) < fourYearsBefore) return 'before-declaration';
  }

  return null;
}

export interface ClaimSummary {
  claimableMinor: number;
  reclaimMinor: number;
  count: number;
  /** Donations that cannot be claimed, grouped by why. */
  excluded: Record<Ineligibility, { count: number; amountMinor: number }>;
}

export function summariseClaim(donations: ClaimableDonation[]): ClaimSummary {
  const summary: ClaimSummary = {
    claimableMinor: 0,
    reclaimMinor: 0,
    count: 0,
    excluded: {
      'no-declaration': { count: 0, amountMinor: 0 },
      'benefit-too-large': { count: 0, amountMinor: 0 },
      'before-declaration': { count: 0, amountMinor: 0 },
    },
  };

  for (const donation of donations) {
    const reason = ineligibility(donation);

    if (reason) {
      summary.excluded[reason].count += 1;
      summary.excluded[reason].amountMinor += donation.amountMinor;
      continue;
    }

    summary.claimableMinor += donation.amountMinor;
    summary.count += 1;
    /*
     * Reclaim is computed **per donation**, not on the total. Flooring once at the end
     * would over-claim by up to a penny against a total nobody can reconcile back to
     * individual gifts, and the schedule HMRC receives is per donation.
     */
    summary.reclaimMinor += giftAidOnMinor(donation.amountMinor);
  }

  return summary;
}

/** One row per donation, in the order HMRC's Gift Aid schedule expects. */
export const CLAIM_COLUMNS = [
  'Title',
  'First name',
  'Last name',
  'House name or number',
  'Postcode',
  'Aggregated donations',
  'Sponsored event',
  'Donation date',
  'Amount',
] as const;

function csvCell(value: string): string {
  // Quote anything that would otherwise break the row, and double any quote inside it.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The claim as a CSV that matches HMRC's schedule.
 *
 * Dates are `DD/MM/YY` because that is the format the schedule specifies, which is worth
 * saying out loud in a codebase where every other date is ISO 8601 — this one is not a
 * choice and must not be tidied up.
 */
export function claimCsv(donations: ClaimableDonation[]): string {
  const rows = [CLAIM_COLUMNS.join(',')];

  for (const donation of donations) {
    if (ineligibility(donation) !== null) continue;
    const d = donation.declaration!;
    const when = new Date(donation.donatedAt);
    const pad = (n: number) => String(n).padStart(2, '0');

    rows.push(
      [
        '',
        d.firstName,
        d.lastName,
        d.addressLine,
        d.postcode,
        '',
        '',
        `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${String(when.getFullYear()).slice(-2)}`,
        (donation.amountMinor / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(',')
    );
  }

  return rows.join('\n');
}
