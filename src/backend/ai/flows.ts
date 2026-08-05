import { ai } from './genkit';
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

/* -------------------------------------------------------------------------- */
/* Marketing ad copy                                                          */
/* -------------------------------------------------------------------------- */

const adCopyPrompt = ai.definePrompt({
  name: 'adCopyPrompt',
  input: { schema: AdCopyInputSchema },
  output: { schema: AdCopyOutputSchema },
  prompt: `You are a senior direct-response copywriter for a premium live-events ticketing platform.

Write a high-converting ad for this event.

Event name: {{eventName}}
Description: {{eventDescription}}
Target audience: {{targetAudience}}
Channel: {{channel}}
{{#if tone}}Tone: {{tone}}{{/if}}

Rules:
- Match the channel's native format and length conventions.
- Lead with the benefit or the scarcity, never with the venue's name.
- No emoji in the headline. At most two in the body.
- The call to action must be a single imperative clause.
- Return ONLY the structured fields requested. Do not add commentary.`,
});

export const generateAdCopy = ai.defineFlow(
  {
    name: 'generateAdCopy',
    inputSchema: AdCopyInputSchema,
    outputSchema: AdCopyOutputSchema,
  },
  async (input: AdCopyInput): Promise<AdCopyOutput> => {
    const { output } = await adCopyPrompt(input);
    if (!output) throw new Error('Ad copy model returned no structured output.');
    return output;
  }
);

/* -------------------------------------------------------------------------- */
/* Personalised recommendations                                               */
/* -------------------------------------------------------------------------- */

const recommendationPrompt = ai.definePrompt({
  name: 'recommendationPrompt',
  input: { schema: RecommendationInputSchema },
  output: { schema: RecommendationOutputSchema },
  prompt: `You recommend live events to an attendee.

Their stated interests and past activity: {{interests}}

Available events:
{{#each events}}
- id: {{this.id}} | {{this.title}} | category: {{this.category}} | location: {{this.location}} | date: {{this.date}}
{{/each}}

Pick at most {{max}} events, best match first. Return ONLY ids that appear in the list above.
Favour category relevance first, then date proximity. Never invent an id.`,
});

export const recommendEvents = ai.defineFlow(
  {
    name: 'recommendEvents',
    inputSchema: RecommendationInputSchema,
    outputSchema: RecommendationOutputSchema,
  },
  async (input: RecommendationInput): Promise<RecommendationOutput> => {
    const { output } = await recommendationPrompt(input);
    if (!output) throw new Error('Recommendation model returned no structured output.');
    const valid = new Set(input.events.map((e) => e.id));
    return {
      ...output,
      eventIds: output.eventIds.filter((id) => valid.has(id)).slice(0, input.max),
    };
  }
);

/* -------------------------------------------------------------------------- */
/* Similar events                                                             */
/* -------------------------------------------------------------------------- */

const similarEventsPrompt = ai.definePrompt({
  name: 'similarEventsPrompt',
  input: { schema: SimilarEventsInputSchema },
  output: { schema: SimilarEventsOutputSchema },
  prompt: `Someone is viewing this event:
{{currentEvent.title}} ({{currentEvent.category}}) in {{currentEvent.location}} on {{currentEvent.date}}.

Candidates:
{{#each candidates}}
- id: {{this.id}} | {{this.title}} | {{this.category}} | {{this.location}} | {{this.date}}
{{/each}}

Return at most {{max}} candidate ids that someone attending the first event would most likely also want.
Return ONLY ids from the candidate list.`,
});

export const findSimilarEvents = ai.defineFlow(
  {
    name: 'findSimilarEvents',
    inputSchema: SimilarEventsInputSchema,
    outputSchema: SimilarEventsOutputSchema,
  },
  async (input: SimilarEventsInput): Promise<SimilarEventsOutput> => {
    const { output } = await similarEventsPrompt(input);
    if (!output) throw new Error('Similar-events model returned no structured output.');
    const valid = new Set(input.candidates.map((e) => e.id));
    return { eventIds: output.eventIds.filter((id) => valid.has(id)).slice(0, input.max) };
  }
);
