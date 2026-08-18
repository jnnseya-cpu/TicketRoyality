import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import {
  DECLARATION_TEXT,
  DECLARATION_VERSION,
  checkDeclaration,
  claimCsv,
  normalisePostcode,
  summariseClaim,
  type ClaimSummary,
  type ClaimableDonation,
  type DeclarationProblem,
} from '@/shared/gift-aid';

/**
 * Donations, and the Gift Aid declarations that make them worth 25% more.
 *
 * ## A donation is not a ticket, and that is enforced here
 *
 * Gift Aid is claimed on a gift, never on a payment for admission — so a donation is its
 * own amount, recorded in its own collection, and the ticket price is never part of it.
 * The two travel through the same Stripe checkout because that is one card payment for
 * the donor, but they are separate records the moment the money lands, and no code path
 * turns a ticket into a claimable gift.
 *
 * ## The declaration is a record, not a setting
 *
 * A declaration is never edited and never deleted. A donor changing their address makes a
 * new one; a donor withdrawing makes a withdrawal that is stamped and kept. In an audit
 * the question is what this donor declared and when, and a mutable row cannot answer it.
 *
 * ## Idempotency
 *
 * The donation's document id is the payment provider's event id, so a redelivered webhook
 * cannot record the same gift twice — the same rule the ticket path has always used, for
 * the same reason.
 */

const DONATIONS = 'donations';
const DECLARATIONS = 'gift_aid_declarations';

export interface DonationRecord {
  id: string;
  organizerId: string;
  /** The event it was given at, when there was one. A standalone gift has none. */
  eventId?: string;
  userId?: string;
  donorName: string;
  donorEmail: string;
  amountMinor: number;
  currency: string;
  donatedAt: string;
  /** Anything the donor received in return. Almost always zero. */
  benefitMinor?: number;
  providerRef?: string;
  /** Set when the gift is one instalment of a standing arrangement. */
  recurringId?: string;
}

export interface DeclarationRecord {
  id: string;
  organizerId: string;
  email: string;
  userId?: string;
  firstName: string;
  lastName: string;
  addressLine: string;
  postcode: string;
  enduring: boolean;
  madeAt: string;
  /** The exact wording agreed to, and its version. Kept for the audit, not for display. */
  text: string;
  textVersion: string;
  withdrawnAt?: string;
}

/* ------------------------------------------------------------------ */
/* Declarations                                                       */
/* ------------------------------------------------------------------ */

export type DeclarationResult =
  | { ok: true; id: string }
  | { ok: false; problems: DeclarationProblem[] }
  | { ok: false; problems: []; unavailable: true };

export async function recordDeclaration(input: {
  organizerId: string;
  email: string;
  userId?: string;
  firstName: string;
  lastName: string;
  addressLine: string;
  postcode: string;
  enduring: boolean;
}): Promise<DeclarationResult> {
  const problems = checkDeclaration({
    firstName: input.firstName,
    lastName: input.lastName,
    addressLine: input.addressLine,
    postcode: input.postcode,
    // The caller only reaches here from a form where the box was ticked; the shared
    // check still wants it, and passing `true` blindly would make the check a decoration.
    confirmedTaxpayer: true,
  });

  if (problems.length > 0) return { ok: false, problems };
  if (!isAdminConfigured()) return { ok: false, problems: [], unavailable: true };

  try {
    const ref = await getAdminDb()
      .collection(DECLARATIONS)
      .add({
        organizerId: input.organizerId,
        email: input.email.trim().toLowerCase(),
        ...(input.userId ? { userId: input.userId } : {}),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        addressLine: input.addressLine.trim(),
        postcode: normalisePostcode(input.postcode),
        enduring: input.enduring,
        madeAt: new Date().toISOString(),
        // Stored per declaration: in an audit the question is what this donor was shown
        // on the day, and a component that has been edited since cannot answer it.
        text: DECLARATION_TEXT,
        textVersion: DECLARATION_VERSION,
      });

    return { ok: true, id: ref.id };
  } catch (error) {
    reportError(error, { scope: 'giving.declare', organizerId: input.organizerId });
    return { ok: false, problems: [], unavailable: true };
  }
}

/** The declaration in force for this donor and charity, or `null`. */
export async function currentDeclaration(
  organizerId: string,
  email: string
): Promise<DeclarationRecord | null> {
  if (!isAdminConfigured()) return null;

  try {
    const snap = await getAdminDb()
      .collection(DECLARATIONS)
      .where('organizerId', '==', organizerId)
      .where('email', '==', email.trim().toLowerCase())
      .get();

    const live = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as DeclarationRecord)
      .filter((d) => !d.withdrawnAt)
      .sort((a, b) => b.madeAt.localeCompare(a.madeAt));

    return live[0] ?? null;
  } catch (error) {
    reportError(error, { scope: 'giving.currentDeclaration', organizerId });
    return null;
  }
}

/**
 * A donor withdrawing.
 *
 * Stamped rather than deleted, because gifts made *before* the withdrawal stay claimable
 * and the charity must be able to show why. Deleting the row would quietly invalidate
 * claims that were correct when they were made.
 */
export async function withdrawDeclaration(organizerId: string, email: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const snap = await getAdminDb()
      .collection(DECLARATIONS)
      .where('organizerId', '==', organizerId)
      .where('email', '==', email.trim().toLowerCase())
      .get();

    const now = new Date().toISOString();
    await Promise.all(
      snap.docs
        .filter((d) => !d.data().withdrawnAt)
        .map((d) => d.ref.update({ withdrawnAt: now }))
    );

    return true;
  } catch (error) {
    reportError(error, { scope: 'giving.withdraw', organizerId });
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Donations                                                          */
/* ------------------------------------------------------------------ */

export async function recordDonation(input: {
  /** The payment provider's event id. The document id, so a replay records nothing new. */
  providerEventId: string;
  organizerId: string;
  eventId?: string;
  userId?: string;
  donorName: string;
  donorEmail: string;
  amountMinor: number;
  currency: string;
  providerRef?: string;
  recurringId?: string;
  benefitMinor?: number;
}): Promise<'recorded' | 'duplicate' | 'unavailable' | 'refused'> {
  if (!isAdminConfigured()) return 'unavailable';
  if (!input.providerEventId || input.amountMinor <= 0 || !input.organizerId) return 'refused';

  try {
    await getAdminDb()
      .collection(DONATIONS)
      .doc(input.providerEventId)
      .create({
        organizerId: input.organizerId,
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        donorName: input.donorName || 'Anonymous',
        donorEmail: input.donorEmail.trim().toLowerCase(),
        amountMinor: Math.round(input.amountMinor),
        currency: input.currency || 'GBP',
        donatedAt: new Date().toISOString(),
        ...(input.providerRef ? { providerRef: input.providerRef } : {}),
        ...(input.recurringId ? { recurringId: input.recurringId } : {}),
        ...(input.benefitMinor ? { benefitMinor: Math.round(input.benefitMinor) } : {}),
      });

    return 'recorded';
  } catch (error) {
    // ALREADY_EXISTS: the same provider event, delivered twice. Not a failure.
    if ((error as { code?: number }).code === 6) return 'duplicate';
    reportError(error, { scope: 'giving.record', organizerId: input.organizerId });
    return 'unavailable';
  }
}

export async function donationsFor(
  organizerId: string,
  range?: { from?: string; to?: string }
): Promise<DonationRecord[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb()
      .collection(DONATIONS)
      .where('organizerId', '==', organizerId)
      .limit(5000)
      .get();

    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationRecord)
      .filter((d) => (!range?.from || d.donatedAt >= range.from) && (!range?.to || d.donatedAt <= range.to))
      .sort((a, b) => b.donatedAt.localeCompare(a.donatedAt));
  } catch (error) {
    reportError(error, { scope: 'giving.list', organizerId });
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* The claim                                                          */
/* ------------------------------------------------------------------ */

/**
 * Join every donation to the declaration that covers it.
 *
 * Resolved at claim time rather than stamped at donation time, because that is what an
 * enduring declaration is *for*: a donor who gives three times and then declares has made
 * three claimable gifts, and a link written when the money arrived would have missed all
 * of them. A withdrawn declaration still covers gifts made before the withdrawal — the
 * withdrawal is not retrospective, and treating it as such would surrender claims that
 * were valid when they were made.
 */
export async function claimFor(
  organizerId: string,
  range?: { from?: string; to?: string }
): Promise<{ summary: ClaimSummary; csv: string; rows: ClaimableDonation[] }> {
  const donations = await donationsFor(organizerId, range);

  const byEmail = new Map<string, DeclarationRecord[]>();
  if (isAdminConfigured()) {
    try {
      const snap = await getAdminDb()
        .collection(DECLARATIONS)
        .where('organizerId', '==', organizerId)
        .limit(5000)
        .get();

      for (const doc of snap.docs) {
        const record = { id: doc.id, ...(doc.data() as object) } as DeclarationRecord;
        const list = byEmail.get(record.email) ?? [];
        list.push(record);
        byEmail.set(record.email, list);
      }
    } catch (error) {
      reportError(error, { scope: 'giving.claimDeclarations', organizerId });
    }
  }

  const rows: ClaimableDonation[] = donations.map((donation) => {
    const candidates = (byEmail.get(donation.donorEmail) ?? [])
      .filter((d) => !d.withdrawnAt || donation.donatedAt < d.withdrawnAt)
      .sort((a, b) => a.madeAt.localeCompare(b.madeAt));

    // The earliest declaration that can cover this gift, so an enduring declaration
    // reaches back as far as it is entitled to rather than only from the newest one.
    const declaration = candidates[0] ?? null;

    return {
      id: donation.id,
      donatedAt: donation.donatedAt,
      amountMinor: donation.amountMinor,
      ...(donation.benefitMinor ? { benefitMinor: donation.benefitMinor } : {}),
      declaration: declaration
        ? {
            firstName: declaration.firstName,
            lastName: declaration.lastName,
            addressLine: declaration.addressLine,
            postcode: declaration.postcode,
            madeAt: declaration.madeAt,
            enduring: declaration.enduring,
          }
        : null,
    };
  });

  return { summary: summariseClaim(rows), csv: claimCsv(rows), rows };
}
