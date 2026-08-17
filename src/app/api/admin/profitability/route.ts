import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { profitabilityReport } from '@/backend/services/profitability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unit economics. Administrator only — this is the platform's margin, not a public figure. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const report = await profitabilityReport();
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
