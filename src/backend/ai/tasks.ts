import type { z } from 'zod';

import {
  AdCopyInputSchema,
  AdCopyOutputSchema,
  RecommendationInputSchema,
  RecommendationOutputSchema,
  SimilarEventsInputSchema,
  SimilarEventsOutputSchema,
  type AdCopyInput,
  type AdCopyOutput,
  type RecommendationInput,
  type RecommendationOutput,
  type SimilarEventsInput,
  type SimilarEventsOutput,
} from './schemas';

/**
 * The AI task registry — one definition per task, shared by every provider.
 *
 * These prompts used to be Handlebars templates inside Genkit `definePrompt` calls,
 * which tied them to the Google plugin: nothing outside Genkit could render them. Now
 * that Claude and OpenAI stand behind Gemini in the fallback chain, a template only one
 * provider can read would have meant writing each prompt three times, and three copies
 * of a prompt drift the moment one is edited.
 *
 * `render` is plain TypeScript, so every provider gets a byte-identical prompt and the
 * fallback is a genuine retry of the same request rather than a different question.
 */
export interface AiTask<I, O> {
  name: string;
  /** Provider-level system instruction. */
  system: string;
  /** Renders the user-facing prompt. Must be pure. */
  render: (input: I) => string;
  /** The only validator. A provider's output is not trusted until this parses it. */
  outputSchema: z.ZodType<O>;
  /**
   * The output contract in prose, for providers told to emit JSON without a schema.
   * This is documentation for the model, never a second source of truth — `outputSchema`
   * decides what is acceptable, and a mismatch fails the provider rather than the call.
   */
  outputShape: string;
  /** Narrows a valid-but-wrong answer. Runs after schema validation. */
  clamp?: (output: O, input: I) => O;
}

const JSON_RULE =
  'Return ONLY a single JSON object matching the shape below. No prose, no markdown, no code fence.';

export const adCopyTask: AiTask<AdCopyInput, AdCopyOutput> = {
  name: 'ad-copy',
  system:
    'You are a senior direct-response copywriter for a premium live-events ticketing platform.',
  outputSchema: AdCopyOutputSchema,
  outputShape: `{
  "headline": string,        // under 60 characters, no emoji
  "body": string,            // two to four sentences
  "callToAction": string,    // a single imperative clause
  "hashtags": string[]       // three to six, without the # symbol
}`,
  render: (input) => `Write a high-converting ad for this event.

Event name: ${input.eventName}
Description: ${input.eventDescription}
Target audience: ${input.targetAudience}
Channel: ${input.channel}${input.tone ? `\nTone: ${input.tone}` : ''}

Rules:
- Match the channel's native format and length conventions.
- Lead with the benefit or the scarcity, never with the venue's name.
- No emoji in the headline. At most two in the body.
- The call to action must be a single imperative clause.

${JSON_RULE}`,
};

const eventLine = (e: { id: string; title: string; category: string; location: string; date: string }) =>
  `- id: ${e.id} | ${e.title} | category: ${e.category} | location: ${e.location} | date: ${e.date}`;

export const recommendTask: AiTask<RecommendationInput, RecommendationOutput> = {
  name: 'recommend',
  system: 'You recommend live events to an attendee.',
  outputSchema: RecommendationOutputSchema,
  outputShape: `{
  "eventIds": string[],      // ids from the list above, best match first
  "reasoning": string        // one sentence
}`,
  render: (input) => `Their stated interests and past activity: ${input.interests}

Available events:
${input.events.map(eventLine).join('\n')}

Pick at most ${input.max} events, best match first. Return ONLY ids that appear in the
list above. Favour category relevance first, then date proximity. Never invent an id.

${JSON_RULE}`,
  // A model that invents an id would otherwise put a dead link on the page.
  clamp: (output, input) => {
    const valid = new Set(input.events.map((e) => e.id));
    return { ...output, eventIds: output.eventIds.filter((id) => valid.has(id)).slice(0, input.max) };
  },
};

export const similarTask: AiTask<SimilarEventsInput, SimilarEventsOutput> = {
  name: 'similar',
  system: 'You find events an attendee would also want, given one they are viewing.',
  outputSchema: SimilarEventsOutputSchema,
  outputShape: `{
  "eventIds": string[]       // ids from the candidate list only
}`,
  render: (input) => `Someone is viewing this event:
${input.currentEvent.title} (${input.currentEvent.category}) in ${input.currentEvent.location} on ${input.currentEvent.date}.

Candidates:
${input.candidates.map(eventLine).join('\n')}

Return at most ${input.max} candidate ids that someone attending the first event would
most likely also want. Return ONLY ids from the candidate list.

${JSON_RULE}`,
  clamp: (output, input) => {
    const valid = new Set(input.candidates.map((e) => e.id));
    return { eventIds: output.eventIds.filter((id) => valid.has(id)).slice(0, input.max) };
  },
};

/** Input schemas, used to reject a malformed request before it reaches a provider. */
export const TASK_INPUT_SCHEMAS = {
  'ad-copy': AdCopyInputSchema,
  recommend: RecommendationInputSchema,
  similar: SimilarEventsInputSchema,
} as const;

export const TASKS = {
  'ad-copy': adCopyTask,
  recommend: recommendTask,
  similar: similarTask,
} as const;

export type TaskName = keyof typeof TASKS;

export function isTaskName(value: unknown): value is TaskName {
  return typeof value === 'string' && value in TASKS;
}
