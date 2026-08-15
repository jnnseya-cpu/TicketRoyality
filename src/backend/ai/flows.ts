import 'server-only';

import { runTask } from './gateway';
import { adCopyTask, recommendTask, similarTask } from './tasks';
import type {
  AdCopyInput,
  AdCopyOutput,
  RecommendationInput,
  RecommendationOutput,
  SimilarEventsInput,
  SimilarEventsOutput,
} from './schemas';

/**
 * The AI features, as plain async functions.
 *
 * These were Genkit flows built on `definePrompt` with Handlebars templates, which
 * bound every one of them to the Google plugin. They now go through `gateway.ts`, so
 * each call falls back Gemini -> Claude -> OpenAI instead of failing when one vendor
 * has a bad afternoon. The prompts themselves moved to `tasks.ts` so all three
 * providers ask the identical question.
 *
 * The signatures are unchanged: `/api/ai` and anything else importing these keeps
 * working without edits.
 */

export async function generateAdCopy(input: AdCopyInput): Promise<AdCopyOutput> {
  return (await runTask(adCopyTask, input)).output;
}

export async function recommendEvents(input: RecommendationInput): Promise<RecommendationOutput> {
  return (await runTask(recommendTask, input)).output;
}

export async function findSimilarEvents(input: SimilarEventsInput): Promise<SimilarEventsOutput> {
  return (await runTask(similarTask, input)).output;
}
