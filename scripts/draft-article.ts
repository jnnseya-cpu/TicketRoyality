/**
 * The AI blog-drafting assistant.
 *
 *   npm run draft:article -- "How to price a club night" selling ["target keyword"]
 *
 * It asks the AI gateway (Gemini → Claude → OpenAI) for an SEO-structured draft, grounded
 * ONLY in a short list of verified platform facts, scores it with the same `scoreArticle`
 * the editor uses, and prints a ready-to-review `Article` object.
 *
 * ## What it deliberately does NOT do
 *
 * It does not publish. Articles on this platform are curated code, gated by `check:links`,
 * because sixteen AI-written articles describing features that did not exist were once
 * published and had to be retracted (see STATUS.md / articles.ts). So this prints a
 * **draft** (`status: 'draft'`) for a human to read, fact-check and paste into
 * `src/shared/content/articles.ts`. The grounding list and the "never invent a platform
 * fact" system prompt make the model write generally rather than inventing features — but
 * the human, not the model, decides what ships.
 *
 * Needs at least one of GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY in the
 * environment. Without a key the gateway reports that no provider is configured.
 */
// Relative imports, not the `@/` alias: the scripts run under tsx, which does not resolve
// the tsconfig path alias (every tsx-run file in this repo imports relatively).
import { runTask } from '../src/backend/ai/gateway';
import { blogDraftTask } from '../src/backend/ai/tasks';
import { CLUSTERS, clusterMeta, type Cluster, type Article } from '../src/shared/content/articles';
import { scoreArticle } from '../src/shared/seo-score';

/**
 * Verified facts the model may state about TicketRoyality. Everything here is true as of
 * this writing; keep it in step with STATUS.md. The model is told to state NO platform
 * fact outside this list.
 */
const PLATFORM_FACTS = [
  'On the standard plan TicketRoyality charges organisers 0% commission; the buyer pays one all-in service fee (UK: 3.99% + £0.49, minimum £0.79, VAT included) shown inside the price before checkout, never added at the till.',
  'Organisers keep 100% of face value on the standard plan and are paid out to their own bank account after the event.',
  'Every ticket is a QR code that refreshes every 30 seconds and can be scanned in only once, so a forwarded screenshot is stale and a ticket cannot be reused.',
  'The door scanner works offline: it caches the guest list on the device and admits guests with no internet, syncing every scan when the connection returns.',
  'Organisers can sell at the door in cash, card or mobile money, each a real, scannable, counted ticket at the same price as online.',
  'Mobile money is supported for the Congolese corridor — Vodacom, Airtel, Orange and Africell.',
  'Free tickets carry no fee to anyone.',
  'A white-label plan, by arrangement, lets an organiser sell under their own brand and set their own booking fee; TicketRoyality then takes a small per-ticket cut instead of the buyer service fee.',
  'Organisers can sell tiered tickets, presales, season tickets, hospitality tables, and track promoters with per-link commissions.',
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

async function main() {
  const [topic, clusterArg, targetKeyword] = process.argv.slice(2);

  if (!topic || !clusterArg) {
    console.error('Usage: npm run draft:article -- "<topic>" <cluster> ["<target keyword>"]');
    console.error(`Clusters: ${CLUSTERS.map((c) => c.key).join(', ')}`);
    process.exit(1);
  }

  let meta;
  try {
    meta = clusterMeta(clusterArg as Cluster);
  } catch {
    console.error(`Unknown cluster "${clusterArg}". One of: ${CLUSTERS.map((c) => c.key).join(', ')}`);
    process.exit(1);
    return;
  }

  console.error(`Drafting "${topic}" in cluster "${meta.key}"…`);
  const result = await runTask(blogDraftTask, {
    topic,
    clusterTitle: meta.title,
    clusterIntent: meta.intent,
    ...(targetKeyword ? { targetKeyword } : {}),
    facts: PLATFORM_FACTS,
  });
  const out = result.output;

  const now = new Date().toISOString();
  const wordCount = out.blocks.reduce(
    (sum, b) => sum + `${b.text ?? ''} ${(b.items ?? []).join(' ')}`.trim().split(/\s+/).filter(Boolean).length,
    0
  );

  // A sensible default link block so the piece points at live inventory. The author can
  // refine the query to the article's subject.
  const linkSlots = [{ heading: 'Upcoming events', query: out.tags[0] ?? '', href: '/events' }];

  const draft: Article = {
    slug: slugify(out.title),
    status: 'draft',
    title: out.title,
    kind: 'guide',
    cluster: meta.key,
    excerpt: out.excerpt,
    published: now,
    updated: now,
    readMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    author: 'TicketRoyality',
    tags: out.tags,
    blocks: out.blocks as Article['blocks'],
    answers: out.answers,
    linkSlots,
  };

  const seo = scoreArticle({ ...draft });

  console.log('\n================ SEO SCORE ================');
  console.log(`${seo.score}/100 — ${seo.grade}  (provider: ${result.provider})`);
  const failing = seo.checks.filter((c) => !c.ok);
  if (failing.length === 0) {
    console.log('All checks pass. Ready for a human fact-check before it ships.');
  } else {
    console.log('\nTo reach 90+, fix:');
    for (const c of failing) console.log(`  ✗ ${c.label} (−${c.weight}) — ${c.advice}`);
  }

  console.log('\n================ DRAFT (review, then paste into articles.ts) ================');
  console.log(JSON.stringify(draft, null, 2));
  console.log(
    '\nReminder: this is status:"draft". Fact-check every platform claim against STATUS.md, ' +
      'set a unique slug, flip to "shipped" only when true, and run `npm run check:links`.'
  );
}

main().catch((error) => {
  console.error('\nDrafting failed:', error instanceof Error ? error.message : error);
  console.error('Set GEMINI_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) and try again.');
  process.exit(1);
});
