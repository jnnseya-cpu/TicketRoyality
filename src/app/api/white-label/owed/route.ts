import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { isAdminConfigured } from '@/backend/firebase/admin';
import { whiteLabelOwedForOrganiser } from '@/backend/services/settlement';
import { whiteLabelProfileFor } from '@/backend/services/white-label';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The authoritative balance for a white-label organiser's revenue page.
 *
 * A standard organiser keeps 100% of face, which the page computes client-side. A
 * white-label organiser keeps their recorded payout — not face — and the client cannot
 * work that out (it depends on the per-order card cost). This returns the real figures,
 * summed from the recorded snapshots the same way settlement pays them, so the page shows
 * what the organiser will actually receive rather than a face-value overstatement.
 *
 * `whiteLabel: false` tells the page to keep its standard client-side calculation.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ whiteLabel: false });

  // Only a white-label organiser gets the server figure; everyone else keeps the face path.
  const wl = await whiteLabelProfileFor(caller.uid).catch(() => null);
  if (!wl) return NextResponse.json({ whiteLabel: false });

  const owed = await whiteLabelOwedForOrganiser(caller.uid);
  return NextResponse.json({ whiteLabel: true, ...owed });
}
