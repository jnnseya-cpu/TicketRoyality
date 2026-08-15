import { z } from 'zod';

/**
 * Zod schemas live in their own module because files marked `'use server'` may only
 * export async functions — exporting a schema object from a flow file is a build error.
 */

export const AdCopyInputSchema = z.object({
  eventName: z.string(),
  eventDescription: z.string(),
  targetAudience: z.string(),
  channel: z.enum(['facebook', 'instagram', 'twitter', 'email']),
  tone: z.string().optional(),
});
export type AdCopyInput = z.infer<typeof AdCopyInputSchema>;

export const AdCopyOutputSchema = z.object({
  headline: z.string().describe('A short, high-impact headline under 60 characters.'),
  body: z.string().describe('Two to four sentences of persuasive body copy.'),
  callToAction: z.string().describe('A short imperative call to action.'),
  hashtags: z.array(z.string()).describe('Three to six relevant hashtags, without the # symbol.'),
});
export type AdCopyOutput = z.infer<typeof AdCopyOutputSchema>;

const EventSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  location: z.string(),
  date: z.string(),
});

export const RecommendationInputSchema = z.object({
  interests: z.string(),
  max: z.number().min(1).max(12),
  events: z.array(EventSummarySchema),
});
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;

export const RecommendationOutputSchema = z.object({
  eventIds: z.array(z.string()).describe('Recommended event IDs, best match first.'),
  reasoning: z.string().describe('One sentence explaining the selection.'),
});
export type RecommendationOutput = z.infer<typeof RecommendationOutputSchema>;

export const SimilarEventsInputSchema = z.object({
  currentEvent: EventSummarySchema,
  max: z.number().min(1).max(8),
  candidates: z.array(EventSummarySchema),
});
export type SimilarEventsInput = z.infer<typeof SimilarEventsInputSchema>;

export const SimilarEventsOutputSchema = z.object({
  eventIds: z.array(z.string()),
});
export type SimilarEventsOutput = z.infer<typeof SimilarEventsOutputSchema>;
