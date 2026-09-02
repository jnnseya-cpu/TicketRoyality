import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { WhiteLabelFeeProfile } from '@/shared/fees';
import type { WhiteLabelConfig } from '@/shared/types';

/**
 * White-label configuration, read and written server-side.
 *
 * ## Why every write here is server-side
 *
 * A white-label config has two kinds of field, and only one kind is the organiser's to
 * set. `brandName`, the booking-fee inputs and `feeMode` are theirs. `enabled` and
 * `platformPerTicketMinor` are **the platform's revenue switch** — the organiser must
 * never be able to flip themselves live, or set the platform's cut to zero. If the
 * config were a client write governed by `firestore.rules`, keeping an organiser out of
 * two nested fields of an object they otherwise own is exactly the kind of rule that is
 * one refactor away from wrong. So neither write touches the client SDK: the organiser's
 * own settings go through `saveWhiteLabelSettings` (which cannot write the privileged
 * fields), and the grant goes through `grantWhiteLabel` (superuser-gated at the route).
 *
 * ## The resolver is the gate
 *
 * `whiteLabelProfileFor` returns a profile **only when `enabled` is true**. Every caller
 * that prices or brands a white-label order goes through it, so a config that exists but
 * has not been granted prices and renders exactly like the standard platform — there is
 * no half-on state.
 */

/** Defaults for a config that exists but has not been fully filled in. */
const DEFAULT_PLATFORM_PER_TICKET_MINOR = 40; // 40p, the tested reference cut. Superuser overrides on grant.

export interface ResolvedWhiteLabel {
  organiserId: string;
  brandName?: string;
  customDomain?: string;
  profile: WhiteLabelFeeProfile;
}

function readConfig(data: unknown): WhiteLabelConfig | undefined {
  const wl = (data as { whiteLabel?: WhiteLabelConfig } | undefined)?.whiteLabel;
  return wl && typeof wl === 'object' ? wl : undefined;
}

/**
 * The pricing/branding profile for an organiser, or `null` when white-label is not
 * enabled for them. Null is the standard-platform path — every caller treats it that way.
 */
export async function whiteLabelProfileFor(
  organiserId: string
): Promise<ResolvedWhiteLabel | null> {
  if (!organiserId || !isAdminConfigured()) return null;

  let config: WhiteLabelConfig | undefined;
  try {
    const snap = await getAdminDb().collection('users').doc(organiserId).get();
    config = readConfig(snap.data());
  } catch {
    // A read failure must not accidentally price an order as white-label; fail to the
    // standard path, which is always safe (the platform never loses money on it).
    return null;
  }

  if (!config || config.enabled !== true) return null;

  return {
    organiserId,
    brandName: config.brandName?.trim() || undefined,
    customDomain: config.customDomain?.trim().toLowerCase() || undefined,
    profile: {
      buyerFeePct: clampPct(config.buyerFeePct),
      buyerFeeFixedMinor: clampMinor(config.buyerFeeFixedMinor),
      feeMode: config.feeMode === 'pass' ? 'pass' : 'absorb',
      platformPerTicketMinor:
        clampMinor(config.platformPerTicketMinor) || DEFAULT_PLATFORM_PER_TICKET_MINOR,
    },
  };
}

/** The raw config for the settings UI (whether or not enabled). Never returns privileged edits. */
export async function whiteLabelConfigFor(
  organiserId: string
): Promise<WhiteLabelConfig | null> {
  if (!organiserId || !isAdminConfigured()) return null;
  try {
    const snap = await getAdminDb().collection('users').doc(organiserId).get();
    return readConfig(snap.data()) ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface OrganiserWhiteLabelSettings {
  brandName?: string;
  buyerFeePct?: number;
  buyerFeeFixedMinor?: number;
  feeMode?: 'absorb' | 'pass';
  customDomain?: string;
}

/**
 * The organiser's own white-label settings. Writes ONLY the organiser-controlled fields —
 * `enabled` and `platformPerTicketMinor` are never touched here, so this endpoint can be
 * exposed to the organiser without ever letting them switch themselves live or zero the
 * platform's cut. Merged, so a partial save does not clear the rest of the config.
 */
export async function saveWhiteLabelSettings(
  uid: string,
  settings: OrganiserWhiteLabelSettings
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!uid || !isAdminConfigured()) return { ok: false, error: 'Unavailable.' };

  const update: Record<string, unknown> = {};
  if (settings.brandName !== undefined) {
    const name = settings.brandName.trim().slice(0, 60);
    update['whiteLabel.brandName'] = name || null;
  }
  if (settings.buyerFeePct !== undefined) {
    update['whiteLabel.buyerFeePct'] = clampPct(settings.buyerFeePct);
  }
  if (settings.buyerFeeFixedMinor !== undefined) {
    update['whiteLabel.buyerFeeFixedMinor'] = clampMinor(settings.buyerFeeFixedMinor);
  }
  if (settings.feeMode !== undefined) {
    update['whiteLabel.feeMode'] = settings.feeMode === 'pass' ? 'pass' : 'absorb';
  }
  if (settings.customDomain !== undefined) {
    const host = normaliseHost(settings.customDomain);
    if (settings.customDomain.trim() && !host) {
      return { ok: false, error: 'That does not look like a valid domain (e.g. tickets.yourbrand.com).' };
    }
    // Stored as requested; it does nothing until DNS + TLS are attached (Slice D / owner).
    update['whiteLabel.customDomain'] = host || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  try {
    await getAdminDb().collection('users').doc(uid).set({ whiteLabel: {} }, { merge: true });
    await getAdminDb().collection('users').doc(uid).update(update);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save your white-label settings.' };
  }
}

/**
 * The superuser grant — the only place `enabled` and the platform's per-ticket revenue are
 * set. Kept apart from the organiser's own settings on purpose: this is the platform's
 * money switch, not a preference.
 */
export async function grantWhiteLabel(
  organiserId: string,
  input: { enabled: boolean; platformPerTicketMinor?: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!organiserId || !isAdminConfigured()) return { ok: false, error: 'Unavailable.' };

  const update: Record<string, unknown> = { 'whiteLabel.enabled': input.enabled === true };
  if (input.platformPerTicketMinor !== undefined) {
    update['whiteLabel.platformPerTicketMinor'] = clampMinor(input.platformPerTicketMinor);
  }

  try {
    // Seed defaults the organiser can later edit, so a freshly granted account is not
    // half-configured: zero fan fee, absorbed, and the reference platform cut unless one
    // was passed. The organiser sets brandName and their fee from settings.
    const snap = await getAdminDb().collection('users').doc(organiserId).get();
    const existing = readConfig(snap.data());
    const seed: Partial<WhiteLabelConfig> = {
      buyerFeePct: existing?.buyerFeePct ?? 0,
      buyerFeeFixedMinor: existing?.buyerFeeFixedMinor ?? 0,
      feeMode: existing?.feeMode ?? 'absorb',
      platformPerTicketMinor:
        existing?.platformPerTicketMinor ?? DEFAULT_PLATFORM_PER_TICKET_MINOR,
    };
    await getAdminDb()
      .collection('users')
      .doc(organiserId)
      .set({ whiteLabel: seed }, { merge: true });
    await getAdminDb().collection('users').doc(organiserId).update(update);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the grant.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Validation — shared with the client display so both agree.                  */
/* -------------------------------------------------------------------------- */

function clampPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(25, Math.round(n * 100) / 100); // one-hundredth of a percent, capped at 25%.
}

function clampMinor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100_000, Math.round(n)); // integer minor units, sane ceiling.
}

/**
 * A bare hostname, lowercased, no scheme, port or path. Returns '' when the input is not a
 * plausible domain. Deliberately strict: a custom domain is security-sensitive routing.
 */
export function normaliseHost(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!trimmed) return '';
  // labels of a-z0-9 and hyphens, at least two, a TLD of 2+ letters.
  return /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(trimmed) ? trimmed : '';
}
