import 'server-only';

import { chargeForProviderCost, publicCharge, type PublicCharge } from '@/shared/constants/billing';

import {
  ProviderError,
  callProvider,
  configuredProviders,
  costUsd,
  type ProviderName,
} from './providers';
import type { AiTask } from './tasks';

/**
 * The AI gateway: one task, tried against each configured provider in turn.
 *
 * The point is that AI is never a single point of failure (CLAUDE.md §9). Before this
 * existed, every AI feature on the platform went through one Gemini call, so a Google
 * incident took ad copy, recommendations and similar-events down together, with no
 * second door — even though Anthropic and OpenAI were already approved vendors.
 *
 * A provider is only "successful" once its output has parsed as JSON *and* satisfied
 * the task's zod schema. A model that returns confident prose instead of an object has
 * failed, and the next provider gets the same question.
 */

export interface GatewayResult<O> {
  output: O;
  provider: ProviderName;
  model: string;
  /**
   * Internal breakdown — provider cost and markup. For the ACU ledger and the admin
   * console only; never serialise this to a client.
   */
  billing: ReturnType<typeof chargeForProviderCost>;
  /** Safe to return over the API: the ACU price, and nothing about how it was reached. */
  publicBilling: PublicCharge;
  /** Providers tried and rejected before this one answered. */
  attempts: Array<{ provider: ProviderName; error: string }>;
}

export class NoProviderAvailableError extends Error {
  constructor(readonly attempts: Array<{ provider: ProviderName; error: string }>) {
    super(
      attempts.length === 0
        ? 'No AI provider is configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY.'
        : `Every AI provider failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join('; ')}`
    );
    this.name = 'NoProviderAvailableError';
  }
}

/**
 * Pulls a JSON object out of a model response.
 *
 * Models fence JSON in markdown even when told not to, and some prepend a sentence of
 * commentary. Both are recoverable, and recovering costs one string operation against
 * an entire wasted provider call.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost braces.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object in response');
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export async function runTask<I, O>(task: AiTask<I, O>, input: I): Promise<GatewayResult<O>> {
  const providers = configuredProviders();
  const attempts: Array<{ provider: ProviderName; error: string }> = [];

  const system = task.system;
  // The rendered prompt ends with "matching the shape below", so the shape has to
  // follow it. Appended here rather than inside each `render` so no task can forget it
  // and leave a model guessing at the field names.
  const prompt = `${task.render(input)}\n\n${task.outputShape}`;

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, system, prompt);

      // Validate before trusting. `parse` throws on a shape mismatch, which is caught
      // below and treated exactly like a network failure — because for our purposes it
      // is the same thing: this provider did not answer the question.
      const parsed = task.outputSchema.parse(extractJson(result.text));
      const output = task.clamp ? task.clamp(parsed, input) : parsed;

      return {
        output,
        provider: result.provider,
        model: result.model,
        billing: chargeForProviderCost(
          costUsd(result.provider, result.inputTokens, result.outputTokens)
        ),
        publicBilling: publicCharge(
          costUsd(result.provider, result.inputTokens, result.outputTokens)
        ),
        attempts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ provider, error: message.slice(0, 200) });

      // Logged per provider rather than only at the end, so a provider that is failing
      // every request still shows up in Cloud Logging while the fallback quietly keeps
      // the feature working. A silent fallback is how you discover in a month that you
      // have been paying Claude prices for everything.
      console.error('[ai-gateway] provider failed', {
        task: task.name,
        provider,
        error: message.slice(0, 200),
      });

      if (error instanceof ProviderError && !error.worthFailingOver) break;
    }
  }

  throw new NoProviderAvailableError(attempts);
}
