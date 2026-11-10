import { z } from 'zod';

/**
 * Growth Brief v1 — the contract that connects the Trend Intelligence engine to this
 * host (external spec §6, Appendix A). The engine issues a versioned brief; the host's
 * existing agents resolve it at run time and adapt their work to it, without ever being
 * granted new authority. This file is the host-side mirror of `contracts/growth-brief.v1`.
 *
 * Treated as a CLOSED object: unknown fields are rejected (`.strict()`), exactly as the
 * schema in Appendix A requires. Any change to this shape is a new schema version.
 *
 * Pure and shared: no I/O, no `server-only`. The SDK in `backend/trend` resolves and
 * caches it; agents read it as data alongside their existing instructions.
 */

/** The channel routing values the brief may target. Only `seo` and `organic_social` are
 * live draft routes in v1; the rest reserve stable values for future adapters (§507). */
export const BRIEF_CHANNELS = [
  'seo',
  'organic_social',
  'sales_enablement',
  'owned_placement',
  'lifecycle',
  'paid',
] as const;
export type BriefChannel = (typeof BRIEF_CHANNELS)[number];

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, 'invalid id');
const score = z.number().min(0).max(100);
// Appendix A: date-time ending in Z. zod's .datetime() (offset:false) accepts exactly that.
const utc = z.string().datetime({ offset: false });
const shortText = z.string().min(1).max(500);

/** JSON Schema `uniqueItems: true`, which zod has no native form of. */
const unique = <T>(arr: T[]): boolean => new Set(arr.map((x) => JSON.stringify(x))).size === arr.length;

export const GrowthBriefSchema = z
  .object({
    schema_version: z.literal(1),
    brief_id: id,
    brief_version: z.number().int().min(1),
    tenant_id: id,
    platform_id: id,
    market: z.string().regex(/^[A-Z]{2}$/, 'market must be an ISO alpha-2 code'),
    locale: z.string().min(2).max(35),
    topic_id: id,
    opportunity_score: score,
    confidence: score,
    valid_from: utc,
    expires_at: utc,
    evidence_ids: z.array(id).min(1).max(64).refine(unique, 'evidence_ids must be unique'),
    audience: shortText,
    intent: shortText,
    approved_claim_ids: z.array(id).max(64).refine(unique, 'approved_claim_ids must be unique'),
    cta_id: id,
    allowed_channels: z
      .array(z.enum(BRIEF_CHANNELS))
      .min(1)
      .max(6)
      .refine(unique, 'allowed_channels must be unique'),
    prohibited_claims: z.array(shortText).max(32).refine(unique, 'prohibited_claims must be unique'),
    objective: shortText,
    experiment_id: id,
    policy_version: z.number().int().min(1),
  })
  .strict()
  // Runtime rule beyond JSON Schema (§507): valid_from strictly before expires_at.
  .refine((b) => Date.parse(b.valid_from) < Date.parse(b.expires_at), {
    message: 'valid_from must be before expires_at',
    path: ['expires_at'],
  });

export type GrowthBrief = z.infer<typeof GrowthBriefSchema>;

export type ParseResult = { ok: true; brief: GrowthBrief } | { ok: false; error: string };

/** Validate an untrusted payload against the closed schema. */
export function parseGrowthBrief(data: unknown): ParseResult {
  const result = GrowthBriefSchema.safeParse(data);
  if (result.success) return { ok: true, brief: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  };
}

/**
 * Freshness (§507): a brief may be used only while `valid_from ≤ now < expires_at`.
 * Schema-valid is not the same as fresh — an expired brief is a valid object the host
 * must still refuse to act on.
 */
export function isBriefFresh(brief: GrowthBrief, nowMs: number): boolean {
  return Date.parse(brief.valid_from) <= nowMs && nowMs < Date.parse(brief.expires_at);
}
