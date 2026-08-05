import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * Genkit runtime. Server-only — never import this from a client component.
 * Requires GEMINI_API_KEY in the environment.
 */
export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
  model: googleAI.model('gemini-2.5-flash'),
});

export const isAiConfigured = Boolean(process.env.GEMINI_API_KEY);

/**
 * Approximate provider cost for a Gemini Flash call, in USD.
 * Used by the ACU billing layer to work out what to charge (cost x markup).
 */
export function estimateProviderCostUsd(promptChars: number, outputChars: number) {
  const promptTokens = promptChars / 4;
  const outputTokens = outputChars / 4;
  const INPUT_USD_PER_1K = 0.000075;
  const OUTPUT_USD_PER_1K = 0.0003;
  return (promptTokens / 1000) * INPUT_USD_PER_1K + (outputTokens / 1000) * OUTPUT_USD_PER_1K;
}
