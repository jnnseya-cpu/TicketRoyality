import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single entry point for every AI task. The client never talks to a model provider
 * directly — this route is where the request is validated, where the provider fallback
 * chain runs, and where cost is measured and ACU is billed.
 *
 * Billing contract (see src/shared/constants/billing.ts):
 *   userCharge = providerCost x 4, converted to ACU at 1 ACU = $0.01, rounded up.
 *
 * Cost is computed from the tokens the *answering* provider reported, not from a fixed
 * estimate, because the fallback chain means the same task can be served by models that
 * differ in price by a factor of forty.
 */
export async function POST(request: Request) {
  // Imported lazily so a missing or invalid API key cannot break unrelated routes at
  // build time.
  const { configuredProviders } = await import('@/backend/ai/providers');

  if (configuredProviders().length === 0) {
    // Callers are built to degrade gracefully — 503 signals "use your fallback".
    return NextResponse.json(
      {
        error:
          'AI is not configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      },
      { status: 503 }
    );
  }

  let payload: { task?: unknown; input?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { isTaskName, TASKS, TASK_INPUT_SCHEMAS } = await import('@/backend/ai/tasks');

  if (!payload.task) return NextResponse.json({ error: 'Missing "task".' }, { status: 400 });
  if (!isTaskName(payload.task)) {
    return NextResponse.json({ error: `Unknown task "${String(payload.task)}".` }, { status: 400 });
  }

  // Validate the input here rather than letting a malformed request reach three
  // providers in turn and bill for the privilege.
  const parsedInput = TASK_INPUT_SCHEMAS[payload.task].safeParse(payload.input);
  if (!parsedInput.success) {
    return NextResponse.json(
      { error: 'Invalid input for this task.', issues: parsedInput.error.issues },
      { status: 400 }
    );
  }

  const { runTask, NoProviderAvailableError } = await import('@/backend/ai/gateway');

  try {
    // The registry is keyed by the same literal union `isTaskName` narrows to, but each
    // task has its own input/output pair, so the lookup is widened deliberately here.
    const task = TASKS[payload.task] as Parameters<typeof runTask>[0];
    const result = await runTask(task, parsedInput.data as never);

    // Which vendor answered, what it cost us and the markup are all internal. They are
    // logged for the fallback-visibility reason below, not returned: a client that can
    // read the provider cost can read the margin, and a client that can read the model
    // name learns the routing without needing it.
    if (result.attempts.length > 0) {
      console.info('[ai] served after fallback', {
        task: payload.task,
        provider: result.provider,
        skipped: result.attempts.map((attempt) => attempt.provider),
      });
    }

    return NextResponse.json({
      ...(result.output as object),
      billing: result.publicBilling,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI error';

    // Every provider failed. That is a 503 — the request was fine, the vendors were not.
    //
    // The per-provider detail is logged, not returned: `attempts` names each vendor and
    // quotes its error, which tells a caller exactly which AI suppliers the platform
    // uses and what state they are in. The person on the other end needs to know to try
    // again, not which of three APIs was down.
    if (error instanceof NoProviderAvailableError) {
      console.error('[ai] every provider failed', { task: payload.task, attempts: error.attempts });
      return NextResponse.json(
        { error: 'AI is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }

    const overloaded = /503|overload|unavailable|quota|rate/i.test(message);
    return NextResponse.json({ error: message }, { status: overloaded ? 503 : 500 });
  }
}
