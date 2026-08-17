import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { operationsReport } from '@/backend/services/operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Payment and delivery health. Administrators only — it names buyers and amounts. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(await operationsReport(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
