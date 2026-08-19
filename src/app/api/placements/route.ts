import { NextResponse } from 'next/server';

import { placementPricing } from '@/backend/services/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The effective placement catalogue — code defaults with the superuser's dashboard
 * prices applied. Public read: these are advertised prices, and the promotions page
 * must show the same numbers the checkout will charge.
 */
export async function GET() {
  const pricing = await placementPricing();
  return NextResponse.json(
    { placements: Object.values(pricing) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
