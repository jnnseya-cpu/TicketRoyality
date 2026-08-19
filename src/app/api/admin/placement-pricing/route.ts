import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import {
  placementPricing,
  setPlacementPricing,
  type PlacementPriceOverride,
} from '@/backend/services/promotions';
import { PLACEMENTS, type PlacementId } from '@/shared/placements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The superuser's placement price control — "admin too can change from it dashboard".
 *
 * Prices land in `config/placements` and every surface reads them through
 * `placementPricing()`: the promotions page shows them, the card checkout charges the
 * GBP figure, the KODA checkout charges the USD figure. Zero or negative numbers are
 * refused rather than stored — a £0 placement is a free-for-all nobody priced.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { placements?: Record<string, { priceMajor?: unknown; priceUsdMajor?: unknown }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const overrides: Partial<Record<PlacementId, PlacementPriceOverride>> = {};
  for (const [id, prices] of Object.entries(body.placements ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(PLACEMENTS, id)) {
      return NextResponse.json({ error: `Unknown placement "${id}".` }, { status: 400 });
    }
    const entry: PlacementPriceOverride = {};
    if (prices.priceMajor !== undefined) {
      const value = Number(prices.priceMajor);
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ error: 'Prices must be positive numbers.' }, { status: 400 });
      }
      entry.priceMajor = Math.round(value * 100) / 100;
    }
    if (prices.priceUsdMajor !== undefined) {
      const value = Number(prices.priceUsdMajor);
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ error: 'Prices must be positive numbers.' }, { status: 400 });
      }
      entry.priceUsdMajor = Math.round(value * 100) / 100;
    }
    if (Object.keys(entry).length > 0) overrides[id as PlacementId] = entry;
  }

  if (Object.keys(overrides).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  try {
    await setPlacementPricing(overrides);
  } catch {
    return NextResponse.json({ error: 'Could not store the prices.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, placements: Object.values(await placementPricing()) });
}
