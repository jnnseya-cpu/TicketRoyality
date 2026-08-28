import { z } from 'zod';

/**
 * Zod schemas live in their own module because files marked `'use server'` may only
 * export async functions — exporting a schema object from a flow file is a build error.
 */

// Length caps on every free-text field. The 60-call/day cap bounds how OFTEN the model
// runs; these bound how BIG each call is, so a farmed account cannot turn 60 calls into
// a megabyte-prompt bill during a Gemini outage that fails over to the metered vendors.
export const AdCopyInputSchema = z.object({
  eventName: z.string().max(200),
  eventDescription: z.string().max(4_000),
  targetAudience: z.string().max(500),
  channel: z.enum(['facebook', 'instagram', 'twitter', 'email']),
  tone: z.string().max(100).optional(),
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
  id: z.string().max(100),
  title: z.string().max(300),
  category: z.string().max(120),
  location: z.string().max(200),
  date: z.string().max(40),
});

export const RecommendationInputSchema = z.object({
  interests: z.string().max(1_000),
  max: z.number().min(1).max(12),
  // Cap the candidate set: recommendation ranks among a supplied list, and an unbounded
  // array is the other half of the denial-of-wallet vector the field caps close.
  events: z.array(EventSummarySchema).max(300),
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
  candidates: z.array(EventSummarySchema).max(300),
});
export type SimilarEventsInput = z.infer<typeof SimilarEventsInputSchema>;

export const SimilarEventsOutputSchema = z.object({
  eventIds: z.array(z.string()),
});
export type SimilarEventsOutput = z.infer<typeof SimilarEventsOutputSchema>;

/**
 * Dynamic pricing.
 *
 * The input is assembled server-side from Firestore and never accepted from a client.
 * A caller who could send `sold` and `capacity` could manufacture a scarcity story and
 * talk the model into any price it liked — and the price is what the platform charges.
 */
const PricingTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().min(0),
  quantity: z.number().min(0),
  sold: z.number().min(0),
});

export const DynamicPricingInputSchema = z.object({
  eventTitle: z.string(),
  category: z.string(),
  location: z.string(),
  currency: z.string(),
  /** Whole days from now until doors. Negative means the event has passed. */
  daysUntilEvent: z.number(),
  /** How long the event has been on sale, in whole days. */
  daysOnSale: z.number().min(0),
  tiers: z.array(PricingTierSchema).min(1).max(20),
});
export type DynamicPricingInput = z.infer<typeof DynamicPricingInputSchema>;

export const DynamicPricingOutputSchema = z.object({
  suggestions: z
    .array(
      z.object({
        tierId: z.string(),
        suggestedPrice: z.number().min(0),
        reason: z.string(),
      })
    )
    .max(20),
  summary: z.string().describe('One or two sentences on the overall read of demand.'),
});
export type DynamicPricingOutput = z.infer<typeof DynamicPricingOutputSchema>;

/**
 * AI event drafting.
 *
 * The organiser describes the event in a sentence or two; the model returns a filled
 * draft they then edit. It writes into the form rather than into the database — nothing
 * here is authoritative, and every field stays editable, because a model inventing a
 * ticket price that gets published unread is exactly the failure mode to avoid.
 */
export const EventDraftInputSchema = z.object({
  /*
   * Generous, and truncating rather than refusing above the cap: organisers paste
   * whole concept documents here (a real one from live testing was ~4,000 characters
   * of programme structure), and "Invalid input for this task" against a paste is a
   * dead end nobody understands. The first 8,000 characters carry more than enough
   * signal for a listing draft.
   */
  brief: z
    .string()
    .min(10)
    .max(60_000)
    .transform((value) => value.slice(0, 8_000)),
  /** Constrains the model to the real taxonomy instead of inventing a category. */
  categories: z.array(z.string()).min(1),
  city: z.string().optional(),
  currency: z.string().optional(),
  eventType: z.enum(['physical', 'online', 'hybrid']).optional(),
});
export type EventDraftInput = z.infer<typeof EventDraftInputSchema>;

export const EventDraftOutputSchema = z.object({
  title: z.string().describe('An event title under 80 characters.'),
  description: z
    .string()
    .describe('Two to four short paragraphs a buyer would read before booking.'),
  category: z.string().describe('Exactly one value from the supplied list.'),
  tiers: z
    .array(
      z.object({
        name: z.string(),
        /** Major units, matching what the form's price inputs hold. */
        price: z.number().min(0),
        quantity: z.number().int().min(1),
        description: z.string().optional(),
      })
    )
    .min(1)
    .max(4)
    .describe('One to four ticket tiers, cheapest first.'),
});
export type EventDraftOutput = z.infer<typeof EventDraftOutputSchema>;

/**
 * Natural-language room drafting — docs/24 §48–49.
 *
 * "20 curved rows around the stage, starting at 30 seats and growing by 2" becomes a
 * section the organiser reviews in the live preview. Same contract as event drafting:
 * the model proposes, nothing is saved until the organiser submits, and every number is
 * clamped server-side to the bounds the form itself enforces — a model cannot mint a
 * 5,000-seat row any more than a keyboard can.
 */
export const RoomDraftInputSchema = z.object({
  brief: z.string().min(5).max(600),
});
export type RoomDraftInput = z.infer<typeof RoomDraftInputSchema>;

export const RoomDraftOutputSchema = z.object({
  shape: z.enum(['straight', 'curve', 'arc', 'angled', 'vertical']),
  curveDegrees: z.number().int().min(10).max(180).optional(),
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(8),
        seats: z.number().int().min(1).max(80),
        from: z.number().int().min(1).optional(),
        missing: z.array(z.number().int().min(1)).optional(),
        aisleAfter: z.array(z.number().int().min(1)).optional(),
        offset: z.number().min(-8).max(8).optional(),
      })
    )
    .min(1)
    .max(40),
});
export type RoomDraftOutput = z.infer<typeof RoomDraftOutputSchema>;
