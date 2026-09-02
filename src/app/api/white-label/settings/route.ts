import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import {
  saveWhiteLabelSettings,
  whiteLabelConfigFor,
  type OrganiserWhiteLabelSettings,
} from '@/backend/services/white-label';
import type { UserProfile } from '@/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * An organiser reads and edits their OWN white-label settings — brand name, their fan
 * booking fee, absorb/pass, and a requested custom domain. It can never write `enabled`
 * or the platform's per-ticket cut: `saveWhiteLabelSettings` does not expose those, so a
 * hostile caller cannot switch themselves live or zero the platform's revenue by posting
 * extra fields.
 *
 * GET returns the current config so the form can show what is set (including whether a
 * superuser has enabled it and what the platform cut is — read-only to the organiser).
 */

async function isOrganiser(uid: string): Promise<boolean> {
  const snap = await getAdminDb().collection('users').doc(uid).get();
  const type = (snap.data() as UserProfile | undefined)?.userType;
  return type === 'organiser' || type === 'superuser';
}

export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  if (!(await isOrganiser(caller.uid))) {
    return NextResponse.json({ error: 'Organisers only.' }, { status: 403 });
  }

  const config = await whiteLabelConfigFor(caller.uid);
  return NextResponse.json({
    enabled: config?.enabled === true,
    brandName: config?.brandName ?? '',
    buyerFeePct: config?.buyerFeePct ?? 0,
    buyerFeeFixedMinor: config?.buyerFeeFixedMinor ?? 0,
    feeMode: config?.feeMode ?? 'absorb',
    customDomain: config?.customDomain ?? '',
    // Read-only to the organiser — shown so they understand their economics, set by us.
    platformPerTicketMinor: config?.platformPerTicketMinor ?? 0,
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  if (!(await isOrganiser(caller.uid))) {
    return NextResponse.json({ error: 'Organisers only.' }, { status: 403 });
  }

  let body: OrganiserWhiteLabelSettings & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Only the organiser-controlled fields are read; anything else on the body is ignored.
  const result = await saveWhiteLabelSettings(caller.uid, {
    ...(body.brandName !== undefined ? { brandName: String(body.brandName) } : {}),
    ...(body.buyerFeePct !== undefined ? { buyerFeePct: Number(body.buyerFeePct) } : {}),
    ...(body.buyerFeeFixedMinor !== undefined
      ? { buyerFeeFixedMinor: Number(body.buyerFeeFixedMinor) }
      : {}),
    ...(body.feeMode !== undefined
      ? { feeMode: body.feeMode === 'pass' ? 'pass' : 'absorb' }
      : {}),
    ...(body.customDomain !== undefined ? { customDomain: String(body.customDomain) } : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
