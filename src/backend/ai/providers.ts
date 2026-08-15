import 'server-only';

/**
 * The three approved model vendors, behind one interface (CLAUDE.md §1: Anthropic,
 * Google, OpenAI).
 *
 * Each adapter does exactly one thing — turn a system instruction and a prompt into raw
 * text — and nothing here validates or trusts that text. Parsing and schema checking
 * happen once, in `gateway.ts`, so a provider cannot be the thing that decides its own
 * answer was acceptable.
 *
 * Called over plain `fetch` rather than three vendor SDKs. Two reasons: adding
 * `@anthropic-ai/sdk` and `openai` to the root package would put ~40MB into a Cloud Run
 * image for three JSON POSTs, and this codebase has already lost a production deploy to
 * a module that was present locally and absent in the hosted build.
 */

export type ProviderName = 'gemini' | 'anthropic' | 'openai';

export interface ProviderResult {
  provider: ProviderName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** A provider failed in a way worth trying the next one for. */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /**
   * Whether moving to the next provider could plausibly help.
   *
   * A 401 means our key is wrong and every retry will fail the same way, but the *next*
   * provider has a different key, so it is still worth trying. What is not worth trying
   * is a 400 — a malformed request stays malformed everywhere, and failing over would
   * turn one bad request into three.
   */
  get worthFailingOver(): boolean {
    return this.status !== 400;
  }
}

/**
 * USD per 1000 tokens, input and output.
 *
 * Approximate and deliberately conservative — this drives what the user is charged
 * (cost x markup), so erring low would quietly sell AI below cost. Revisit when a
 * vendor changes its price list; the ACU rate absorbs small drift.
 */
const PRICING: Record<ProviderName, { model: string; input: number; output: number }> = {
  gemini: { model: 'gemini-2.5-flash', input: 0.000075, output: 0.0003 },
  anthropic: { model: 'claude-sonnet-4-5', input: 0.003, output: 0.015 },
  openai: { model: 'gpt-4o-mini', input: 0.00015, output: 0.0006 },
};

export function costUsd(provider: ProviderName, inputTokens: number, outputTokens: number) {
  const p = PRICING[provider];
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

/** Rough token count for providers that do not report usage. ~4 chars per token. */
const approxTokens = (text: string) => Math.ceil(text.length / 4);

const TIMEOUT_MS = 45_000;

async function post(url: string, init: RequestInit, provider: ProviderName): Promise<Response> {
  // Without a timeout a hung provider holds the request until Cloud Run's own 300s
  // ceiling, and the user watches a spinner for five minutes instead of getting the
  // second provider's answer in twenty seconds.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ProviderError(
      provider,
      aborted ? `timed out after ${TIMEOUT_MS / 1000}s` : String(error)
    );
  } finally {
    clearTimeout(timer);
  }
}

async function failure(response: Response, provider: ProviderName): Promise<ProviderError> {
  const body = await response.text().catch(() => '');
  return new ProviderError(provider, `${response.status} ${body.slice(0, 300)}`, response.status);
}

/* -------------------------------------------------------------------------- */
/* Google — Gemini                                                            */
/* -------------------------------------------------------------------------- */

async function gemini(system: string, prompt: string): Promise<ProviderResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderError('gemini', 'GEMINI_API_KEY is not set');

  const model = PRICING.gemini.model;
  const response = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    },
    'gemini'
  );

  if (!response.ok) throw await failure(response, 'gemini');

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ProviderError('gemini', 'empty response');

  return {
    provider: 'gemini',
    model,
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? approxTokens(system + prompt),
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? approxTokens(text),
  };
}

/* -------------------------------------------------------------------------- */
/* Anthropic — Claude                                                         */
/* -------------------------------------------------------------------------- */

async function anthropic(system: string, prompt: string): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderError('anthropic', 'ANTHROPIC_API_KEY is not set');

  const model = PRICING.anthropic.model;
  const response = await post(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    'anthropic'
  );

  if (!response.ok) throw await failure(response, 'anthropic');

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
  if (!text) throw new ProviderError('anthropic', 'empty response');

  return {
    provider: 'anthropic',
    model,
    text,
    inputTokens: data.usage?.input_tokens ?? approxTokens(system + prompt),
    outputTokens: data.usage?.output_tokens ?? approxTokens(text),
  };
}

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

async function openai(system: string, prompt: string): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ProviderError('openai', 'OPENAI_API_KEY is not set');

  const model = PRICING.openai.model;
  const response = await post(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        // json_object guarantees syntactically valid JSON, not a conforming shape. The
        // shape is still the schema's job in gateway.ts.
        response_format: { type: 'json_object' },
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    },
    'openai'
  );

  if (!response.ok) throw await failure(response, 'openai');

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new ProviderError('openai', 'empty response');

  return {
    provider: 'openai',
    model,
    text,
    inputTokens: data.usage?.prompt_tokens ?? approxTokens(system + prompt),
    outputTokens: data.usage?.completion_tokens ?? approxTokens(text),
  };
}

const ADAPTERS: Record<ProviderName, (system: string, prompt: string) => Promise<ProviderResult>> = {
  gemini,
  anthropic,
  openai,
};

const ENV_KEY: Record<ProviderName, string> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export function isProviderConfigured(provider: ProviderName): boolean {
  return Boolean(process.env[ENV_KEY[provider]]);
}

/**
 * The fallback order.
 *
 * Gemini leads on price — roughly forty times cheaper per output token than Claude at
 * these models — so it answers the ordinary request. Claude is the quality fallback
 * when Gemini is down or rate-limited, and OpenAI is the third door so that a single
 * vendor incident cannot take every AI feature on the platform offline.
 */
export const FALLBACK_ORDER: ProviderName[] = ['gemini', 'anthropic', 'openai'];

export function configuredProviders(): ProviderName[] {
  return FALLBACK_ORDER.filter(isProviderConfigured);
}

export function callProvider(
  provider: ProviderName,
  system: string,
  prompt: string
): Promise<ProviderResult> {
  return ADAPTERS[provider](system, prompt);
}
