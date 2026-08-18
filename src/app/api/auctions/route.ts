import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { createLot, lotsFor, placeBid } from '@/backend/services/auctions';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reserveState } from '@/shared/auctions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auction lots and bids.
 *
 * ## What a bidder is allowed to see
 *
 * The current price, the number of bids, whether the reserve has been met, and whether
 * they themselves are leading. **Not** the other bidders' names or emails: an auction is
 * public about money and private about people, and a lot list that leaks a guest list is
 * a different product from the one anybody agreed to.
 *
 * The reserve *amount* is never returned either — that is the point of having one — but
 * whether it has been met is, because a room bidding towards a wall they cannot see
 * stops bidding.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const eventId = query.get('eventId') ?? '';
  if (!eventId) return NextResponse.json({ error: 'Which event?' }, { status: 400 });

  // Optional: the caller, so a lot can say "you are leading" without exposing who else is.
  const caller = await requireUser(request);
  const me = caller.ok ? caller.uid : null;

  const lots = await lotsFor(eventId);

  return NextResponse.json(
    {
      lots: lots.map((lot) => ({
        id: lot.id,
        title: lot.title,
        description: lot.description,
        imageUrl: lot.imageUrl,
        currency: lot.currency,
        startMinor: lot.startMinor,
        incrementMinor: lot.incrementMinor,
        highBidMinor: lot.highBidMinor ?? 0,
        bidCount: lot.bidCount ?? 0,
        closesAt: lot.closesAt,
        status: lot.status,
        reserve: reserveState(lot),
        leading: me !== null && lot.highBidderId === me,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  /* Creating a lot — the organiser of the event, checked against the stored event. */
  if (body.action === 'create') {
    const eventId = String(body.eventId ?? '');
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 });
    }

    const event = await getAdminDb().collection('events').doc(eventId).get();
    if (event.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
    }

    const id = await createLot({
      eventId,
      organizerId: caller.uid,
      title: String(body.title ?? '').slice(0, 140),
      description: body.description ? String(body.description).slice(0, 2000) : undefined,
      imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
      startMinor: Number(body.startMinor) || 0,
      incrementMinor: Number(body.incrementMinor) || 100,
      reserveMinor: Number(body.reserveMinor) || undefined,
      closesAt: String(body.closesAt ?? ''),
      extendMinutes: Number(body.extendMinutes ?? 2),
      currency: String(event.data()?.currency ?? 'GBP'),
    });

    return id
      ? NextResponse.json({ ok: true, id })
      : NextResponse.json({ error: 'Could not create that lot.' }, { status: 503 });
  }

  /* Bidding. Every decision is made inside the transaction in the service. */
  const result = await placeBid({
    lotId: String(body.lotId ?? ''),
    amountMinor: Math.round(Number(body.amountMinor) || 0),
    userId: caller.uid,
    // Taken from the token, never the body: a bid recorded under a name the bidder typed
    // is a bid nobody can hold them to.
    name: String(body.name ?? caller.email ?? 'Bidder').slice(0, 120),
    email: caller.email ?? '',
  });

  if (result.ok) return NextResponse.json(result);

  return NextResponse.json(
    { error: result.error, reason: result.reason, minimumMinor: result.minimumMinor },
    // "Too low" is a 409: nothing about the request was malformed, the price simply moved.
    { status: result.reason === 'no-lot' ? 404 : result.reason === 'unavailable' ? 503 : 409 }
  );
}
