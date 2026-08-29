import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { saleTickets } from '@/backend/services/box-office';

export const dynamic = 'force-dynamic';

/**
 * The tickets a door sale issued, so the box office can show the buyer their QR on the
 * spot. Authorised by the sale's event — the owning organiser (token) or a valid door PIN.
 * Returns an empty list while issuance is still catching up, so the caller polls.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const saleId = url.searchParams.get('saleId') ?? '';
  const pin = url.searchParams.get('pin') ?? '';
  if (!saleId) return NextResponse.json({ error: 'Missing sale.' }, { status: 400 });

  if (pin) {
    const result = await saleTickets(saleId, { pin });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
    return NextResponse.json({ tickets: result.tickets });
  }

  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const result = await saleTickets(saleId, { organizerId: caller.uid });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ tickets: result.tickets });
}
