import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import {
  applySuggestion,
  reviewPricing,
  setDynamicPricing,
} from '@/backend/services/dynamic-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * AI dynamic selling for one event. Organiser-owned, verified server-side.
 *
 * `review` asks the AI for suggestions; `apply` commits one of them. Both prove
 * ownership from the verified token before touching anything, and `apply` takes only a
 * tier id — the price comes from the stored suggestion. Accepting a price from the
 * browser would make "approve this suggestion" mean "set any price", which is not what
 * the organiser is being shown a confirmation for.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { id } = await context.params;

  let body: { action?: string; tierId?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'toggle') {
    const result = await setDynamicPricing(id, caller.uid, body.enabled === true);
    return result.ok
      ? NextResponse.json({ ok: true, enabled: result.enabled })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'review') {
    const result = await reviewPricing(id, caller.uid);
    return result.ok
      ? NextResponse.json({ ok: true, summary: result.summary, suggestions: result.suggestions })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'apply') {
    const result = await applySuggestion(id, caller.uid, String(body.tierId ?? ''));
    return result.ok
      ? NextResponse.json({ ok: true, tierId: result.tierId, price: result.price })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
