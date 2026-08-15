/**
 * Gateway tests. Run with: npm run test:ai
 *
 * These run against a real HTTP server speaking each vendor's actual response shape,
 * not a mocked `fetch`. A mock would assert that the code calls what the test author
 * believed the API looks like; a server catches the case where Anthropic nests text in
 * `content[].text` and the adapter reached for `choices[0].message`.
 *
 * The fallback chain is the whole point of the gateway, so the cases that matter are
 * the failures: a vendor that 500s, one that returns confident prose instead of JSON,
 * and one that returns JSON of the wrong shape. Each must hand over to the next.
 */
import { createServer, type Server } from 'node:http';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'test-gemini';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.OPENAI_API_KEY = 'test-openai';

type Handler = (path: string) => { status: number; body: unknown };

let handler: Handler = () => ({ status: 200, body: {} });
const hits: string[] = [];

function vendorOf(path: string) {
  if (path.includes('generativelanguage') || path.includes('generateContent')) return 'gemini';
  if (path.includes('/v1/messages')) return 'anthropic';
  return 'openai';
}

/** Wraps a payload in each vendor's real response envelope. */
function envelope(vendor: string, text: string) {
  if (vendor === 'gemini') {
    return {
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    };
  }
  if (vendor === 'anthropic') {
    return {
      content: [{ type: 'text', text }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  }
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

let server: Server;
let port: number;

async function start() {
  server = createServer((req, res) => {
    const path = req.url ?? '';
    hits.push(vendorOf(path));
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const result = handler(path);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
}

/**
 * Points every vendor URL at the local server.
 *
 * The adapters hard-code their real endpoints — correctly, since a configurable base
 * URL for a payment or model provider is a way to exfiltrate keys. So the test rewrites
 * at the `fetch` boundary instead of adding a seam to production code for its benefit.
 */
function redirectFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const rewritten = url.replace(/^https:\/\/[^/]+/, `http://127.0.0.1:${port}`);
    return real(rewritten, init);
  }) as typeof fetch;
}

const results: Array<[string, boolean, string]> = [];
async function test(name: string, fn: () => Promise<void>) {
  hits.length = 0;
  try {
    await fn();
    results.push([name, true, '']);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push([name, false, message]);
    console.error(`  ✗ ${name}\n      ${message.split('\n')[0]}`);
  }
}

const AD_COPY = JSON.stringify({
  headline: 'One night only',
  body: 'Two sentences of copy. And another.',
  callToAction: 'Book now',
  hashtags: ['live', 'music'],
});

async function main() {
  await start();
  redirectFetch();

  const { runTask, NoProviderAvailableError } = await import('./gateway');
  const { adCopyTask, recommendTask } = await import('./tasks');

  const input = {
    eventName: 'Royal Night',
    eventDescription: 'A gala',
    targetAudience: 'Londoners',
    channel: 'instagram' as const,
  };

  console.log('\nAI gateway\n');

  await test('Gemini answers, no fallback used', async () => {
    handler = (p) => ({ status: 200, body: envelope(vendorOf(p), AD_COPY) });
    const result = await runTask(adCopyTask, input);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.output.headline, 'One night only');
    assert.deepEqual(hits, ['gemini'], 'only Gemini should be called');
    assert.equal(result.attempts.length, 0);
  });

  await test('Gemini 500 falls over to Claude', async () => {
    handler = (p) =>
      vendorOf(p) === 'gemini'
        ? { status: 500, body: { error: 'internal' } }
        : { status: 200, body: envelope(vendorOf(p), AD_COPY) };
    const result = await runTask(adCopyTask, input);
    assert.equal(result.provider, 'anthropic');
    assert.deepEqual(hits, ['gemini', 'anthropic']);
    assert.equal(result.attempts[0].provider, 'gemini');
  });

  await test('prose instead of JSON is a failure, not an answer', async () => {
    handler = (p) =>
      vendorOf(p) === 'gemini'
        ? { status: 200, body: envelope('gemini', 'Certainly! Here is your ad copy.') }
        : { status: 200, body: envelope(vendorOf(p), AD_COPY) };
    const result = await runTask(adCopyTask, input);
    assert.equal(result.provider, 'anthropic', 'unparseable text must fall through');
  });

  await test('valid JSON of the wrong shape is rejected', async () => {
    handler = (p) =>
      vendorOf(p) === 'gemini'
        ? { status: 200, body: envelope('gemini', JSON.stringify({ headline: 'only this' })) }
        : { status: 200, body: envelope(vendorOf(p), AD_COPY) };
    const result = await runTask(adCopyTask, input);
    assert.equal(result.provider, 'anthropic', 'schema mismatch must fall through');
  });

  await test('markdown-fenced JSON is recovered, not discarded', async () => {
    handler = (p) => ({
      status: 200,
      body: envelope(vendorOf(p), '```json\n' + AD_COPY + '\n```'),
    });
    const result = await runTask(adCopyTask, input);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.output.callToAction, 'Book now');
  });

  await test('all three down raises NoProviderAvailableError', async () => {
    handler = () => ({ status: 503, body: { error: 'unavailable' } });
    await assert.rejects(() => runTask(adCopyTask, input), NoProviderAvailableError);
    assert.deepEqual(hits, ['gemini', 'anthropic', 'openai'], 'every provider tried');
  });

  await test('a 400 stops the chain instead of burning all three', async () => {
    handler = () => ({ status: 400, body: { error: 'bad request' } });
    await assert.rejects(() => runTask(adCopyTask, input), NoProviderAvailableError);
    assert.deepEqual(hits, ['gemini'], 'a malformed request stays malformed everywhere');
  });

  await test('clamp drops event ids the model invented', async () => {
    handler = (p) => ({
      status: 200,
      body: envelope(
        vendorOf(p),
        JSON.stringify({ eventIds: ['real-1', 'hallucinated', 'real-2'], reasoning: 'because' })
      ),
    });
    const result = await runTask(recommendTask, {
      interests: 'jazz',
      max: 5,
      events: [
        { id: 'real-1', title: 'A', category: 'Music', location: 'London', date: '2026-09-01' },
        { id: 'real-2', title: 'B', category: 'Music', location: 'Leeds', date: '2026-09-02' },
      ],
    });
    assert.deepEqual(result.output.eventIds, ['real-1', 'real-2']);
  });

  await test('billing is priced against the provider that actually answered', async () => {
    handler = (p) =>
      vendorOf(p) === 'gemini'
        ? { status: 500, body: {} }
        : { status: 200, body: envelope(vendorOf(p), AD_COPY) };
    const claude = await runTask(adCopyTask, input);

    handler = (p) => ({ status: 200, body: envelope(vendorOf(p), AD_COPY) });
    const gem = await runTask(adCopyTask, input);

    assert.equal(claude.provider, 'anthropic');
    assert.equal(gem.provider, 'gemini');
    assert.ok(
      claude.billing.providerCostUsd > gem.billing.providerCostUsd,
      `Claude (${claude.billing.providerCostUsd}) should cost more than Gemini (${gem.billing.providerCostUsd}) for identical tokens`
    );
    assert.ok(gem.billing.acu >= 1, 'a charge always rounds up to at least 1 ACU');
  });

  await test('the prompt carries the output shape to the provider', async () => {
    let seen = '';
    const real = globalThis.fetch;
    globalThis.fetch = ((i: RequestInfo | URL, init?: RequestInit) => {
      seen = String(init?.body ?? '');
      return real(i, init);
    }) as typeof fetch;
    handler = (p) => ({ status: 200, body: envelope(vendorOf(p), AD_COPY) });
    await runTask(adCopyTask, input);
    globalThis.fetch = real;
    assert.ok(seen.includes('callToAction'), 'outputShape must reach the model');
    assert.ok(seen.includes('Royal Night'), 'rendered input must reach the model');
  });

  server.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
