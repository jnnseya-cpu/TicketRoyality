import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { isAdminConfigured } from '@/backend/firebase/admin';
import { grantWhiteLabel } from '@/backend/services/white-label';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The superuser turns white-label on (or off) for an organiser and sets the platform's
 * per-ticket cut — the platform's revenue switch, and the one field an organiser is never
 * allowed to touch. Server-side with the Admin SDK, exactly like the placement grant:
 * `enabled` and `platformPerTicketMinor` are not fields the security rules whitelist for a
 * client write, and they must not be.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 503 });
  }

  let body: { organiserId?: unknown; enabled?: unknown; platformPerTicketMinor?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const organiserId = typeof body.organiserId === 'string' ? body.organiserId.trim() : '';
  if (!organiserId) {
    return NextResponse.json({ error: 'organiserId is required.' }, { status: 400 });
  }

  const result = await grantWhiteLabel(organiserId, {
    enabled: body.enabled === true,
    ...(body.platformPerTicketMinor !== undefined
      ? { platformPerTicketMinor: Number(body.platformPerTicketMinor) }
      : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, enabled: body.enabled === true });
}
