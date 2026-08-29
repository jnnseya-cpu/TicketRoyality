import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { listDoorSales, owedFromSales, refundDoorSale } from '@/backend/services/box-office';

export const dynamic = 'force-dynamic';

/** The organiser's door sales and the service fee they owe. */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const sales = await listDoorSales(caller.uid);
  return NextResponse.json({ sales, owed: owedFromSales(sales) });
}

/** Refund one door sale (organiser hands the cash back separately). */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { saleId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const result = await refundDoorSale(String(body.saleId ?? ''), caller.uid);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
