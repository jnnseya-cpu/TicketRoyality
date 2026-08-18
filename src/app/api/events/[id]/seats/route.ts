import { NextResponse } from 'next/server';

import { suggestSeats, takenSeats } from '@/backend/services/seats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Which seats are gone, for the public seat map.
 *
 * Open, and deliberately so: which seats are free is what a buyer is entitled to know
 * before choosing one. Who is sitting in them is not, and is never returned — the answer
 * is a list of labels.
 *
 * With `tierId` and `quantity`, it also answers "just give me the best seats" — the
 * request most people actually want to make. That answer is a **suggestion**: the seats
 * are not reserved by asking, and the hold transaction at checkout is still the only
 * thing that takes them. Reserving on a suggestion would let anyone empty a house by
 * refreshing.
 *
 * Never cached. A seat map served from a CDN edge is a map of who *was* free, and it
 * sends two buyers to the same seat.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const tierId = query.get('tierId') ?? '';
  const quantity = Number(query.get('quantity') ?? 0);

  try {
    const taken = await takenSeats(id);

    const suggestion =
      tierId && quantity > 0 && quantity <= 20
        ? await suggestSeats(id, tierId, quantity, taken)
        : null;

    return NextResponse.json(
      { taken, suggestion },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // The map says it cannot tell rather than drawing every seat free, which would send
    // buyers at seats that are already sold.
    return NextResponse.json({ error: 'Could not read the seat map.' }, { status: 503 });
  }
}
