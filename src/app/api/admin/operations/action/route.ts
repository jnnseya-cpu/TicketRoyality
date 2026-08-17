import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { retryPaymentEvent, resendTicketEmail } from '@/backend/services/operations-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Acting on what the operations console shows. Administrator only.
 *
 * The action is whitelisted rather than dispatched by name, so a body naming something
 * else gets a 400 instead of reaching a lookup table that might one day grow an entry
 * nobody meant to expose.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';

  const result =
    body.action === 'retry'
      ? await retryPaymentEvent(id)
      : body.action === 'resend'
        ? await resendTicketEmail(id)
        : null;

  if (!result) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  return result.ok
    ? NextResponse.json({ ok: true, message: result.message })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
