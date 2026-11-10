import { NextResponse } from 'next/server';

import { isAuthorisedCron } from '@/shared/cron';
import { runTrendScan } from '@/backend/trend/trend-scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Trend scan sweep (external spec §17). Reads the platform's own first-party sales,
 * writes weekly observations and scores opportunity snapshots. Entirely invisible: it
 * touches no user-facing surface and takes no action — it only records what the demand
 * signal says, for the internal, approval-gated brief step to read later.
 */
export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const result = await runTrendScan();

  return NextResponse.json(
    { ...result, implemented: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
