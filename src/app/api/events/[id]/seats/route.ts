import { NextResponse } from 'next/server';

import { takenSeats } from '@/backend/services/seats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Which seats are gone, for the public seat map.
 *
 * Open, and deliberately so: which seats are free is what a buyer is entitled to know
 * before choosing one. Who is sitting in them is not, and is never returned — the answer
 * is a list of labels.
 *
 * Never cached. A seat map served from a CDN edge is a map of who *was* free, and it
 * sends two buyers to the same seat.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    return NextResponse.json(
      { taken: await takenSeats(id) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // The map says it cannot tell rather than drawing every seat free, which would send
    // buyers at seats that are already sold.
    return NextResponse.json({ error: 'Could not read the seat map.' }, { status: 503 });
  }
}
