import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { deleteOwnAccount } from '@/backend/services/account-deletion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Erasure, of your own account only.
 *
 * The uid comes from the verified ID token and from nowhere else — there is deliberately
 * no uid in the body. A route that deleted whichever account the request named would be
 * the single most destructive endpoint on the platform, and the safest way to not have
 * that bug is to make the parameter impossible to send.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const result = await deleteOwnAccount(caller.uid);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, blockingEvents: result.blockingEvents },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, ticketsAnonymised: result.ticketsAnonymised });
}
