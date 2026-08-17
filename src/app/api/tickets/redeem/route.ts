import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { redeemAtDoor } from '@/backend/services/redeem';
import { decodeTicketQr } from '@/shared/tickets/qr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The door.
 *
 * Redemption moved here from the organiser's browser. The client now decodes the QR for
 * its own display and posts the raw payload; every decision — is this payload genuine,
 * does this caller run this door, is the ticket still valid, and the write itself — is
 * made server-side inside one transaction.
 *
 * The raw string is re-decoded here rather than trusting a parsed object from the
 * client, so a hand-crafted POST goes through exactly the same parser a camera does.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { raw?: string; eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!eventId) return NextResponse.json({ error: 'No event given.' }, { status: 400 });

  const decoded = decodeTicketQr(typeof body.raw === 'string' ? body.raw : '');
  if (!decoded.ok) {
    return NextResponse.json(
      { kind: 'invalid', error: 'That is not a TicketRoyality ticket.' },
      { status: 400 }
    );
  }

  const result = await redeemAtDoor(decoded.payload, eventId, caller.uid);

  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json(
        { kind: result.kind, error: result.error, reference: result.reference, redeemedAt: result.redeemedAt },
        { status: result.status }
      );
}
