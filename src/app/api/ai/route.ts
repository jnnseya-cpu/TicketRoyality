import { NextResponse } from 'next/server';

import { isAiConfigured, estimateProviderCostUsd } from '@/server/ai/genkit';
import { chargeForProviderCost } from '@/shared/constants/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single entry point for every AI task. The client never talks to the model
 * provider directly — this route is where cost is measured and ACU is billed.
 *
 * Billing contract (see src/shared/constants/billing.ts):
 *   userCharge = providerCost x 3, converted to ACU at 1 ACU = $0.01, rounded up.
 */
export async function POST(request: Request) {
  if (!isAiConfigured) {
    // Callers are built to degrade gracefully — 503 signals "use your fallback".
    return NextResponse.json(
      { error: 'AI is not configured. Set GEMINI_API_KEY to enable AI features.' },
      { status: 503 }
    );
  }

  let payload: { task?: string; input?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { task, input } = payload;
  if (!task) return NextResponse.json({ error: 'Missing "task".' }, { status: 400 });

  try {
    // Imported lazily so a missing/invalid API key cannot break unrelated routes at build time.
    const { generateAdCopy, recommendEvents, findSimilarEvents } = await import('@/server/ai/flows');

    let result: unknown;
    switch (task) {
      case 'ad-copy':
        result = await generateAdCopy(input as never);
        break;
      case 'recommend':
        result = await recommendEvents(input as never);
        break;
      case 'similar':
        result = await findSimilarEvents(input as never);
        break;
      default:
        return NextResponse.json({ error: `Unknown task "${task}".` }, { status: 400 });
    }

    const promptChars = JSON.stringify(input ?? {}).length;
    const outputChars = JSON.stringify(result).length;
    const billing = chargeForProviderCost(estimateProviderCostUsd(promptChars, outputChars));

    return NextResponse.json({ ...(result as object), billing });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI error';
    // Model overload / rate limit — the client shows a "busy, try again" state.
    const overloaded = /503|overload|unavailable|quota|rate/i.test(message);
    return NextResponse.json({ error: message }, { status: overloaded ? 503 : 500 });
  }
}
