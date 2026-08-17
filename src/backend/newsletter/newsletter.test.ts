/**
 * Newsletter tests. Run with: npm run test:newsletter
 *
 * Two things here would cause real damage if wrong, and they are what this file pins.
 *
 * The first is honesty. A newsletter is a worse place than a blog to describe a feature
 * that does not exist: a blog post waits to be found, a newsletter arrives in an inbox
 * with the platform's name on it. The content is drawn from `publishedArticles()`, and
 * the test below asserts a draft can never reach it.
 *
 * The second is the unsubscribe link. Without a working one this is not marketing, it
 * is spam — and the reputation damage lands on the same mailbox that delivers tickets.
 */
import assert from 'node:assert/strict';

process.env.CRON_SECRET = 'test-cron-secret-for-signing';
process.env.NEXT_PUBLIC_SITE_URL = 'https://ticketroyality.com';

const results: Array<[string, boolean, string]> = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true, '']);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push([name, false, message]);
    console.error(`  ✗ ${name}\n      ${message.split('\n')[0]}`);
  }
}

async function main() {
  const { buildNewsletter, articlesForWeek, eventsForNewsletter, weekIndex } = await import('./build');
  const { signUnsubscribe, verifyUnsubscribe, unsubscribeUrl, unsubscribeHeaders } = await import(
    '@/backend/comms/unsubscribe'
  );
  const { publishedArticles, allArticles } = await import('@/shared/content/articles');

  const now = new Date('2026-08-16T09:00:00Z');
  const site = 'https://ticketroyality.com';

  const article = (slug: string, status?: 'draft') =>
    ({ slug, title: `Title ${slug}`, excerpt: `Excerpt ${slug}`, status }) as never;

  const event = (id: string, date: string, price = 25) =>
    ({
      id,
      title: `Event ${id}`,
      date,
      location: 'Wembley Stadium, London',
      price,
      currency: 'GBP',
      eventType: 'physical',
    }) as never;

  console.log('\nNewsletter\n');

  /* ---------------- honesty ---------------- */

  test('drafts can never reach the newsletter', () => {
    const drafts = allArticles().filter((a) => a.status === 'draft');
    assert.ok(drafts.length > 0, 'the fixture is meaningless if nothing is currently a draft');
    const publishedSlugs = new Set(publishedArticles().map((a) => a.slug));
    for (const draft of drafts) {
      assert.ok(
        !publishedSlugs.has(draft.slug),
        `draft "${draft.slug}" is in the published set the newsletter draws from`
      );
    }
  });

  test('the article window rotates week to week', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => article(s));
    const w1 = articlesForWeek(pool, 1, 4).map((a) => a.slug);
    const w2 = articlesForWeek(pool, 2, 4).map((a) => a.slug);
    assert.notDeepEqual(w1, w2, 'consecutive weeks must not send the identical four');
    assert.equal(w1.length, 4);
  });

  test('the window wraps rather than running short at the end of the list', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((s) => article(s));
    // Any week must still yield a full set, not a truncated tail.
    for (let week = 0; week < 12; week++) {
      assert.equal(articlesForWeek(pool, week, 4).length, 4, `week ${week} came up short`);
    }
  });

  test('an empty article pool does not crash the build', () => {
    assert.deepEqual(articlesForWeek([], 3, 4), []);
  });

  /* ---------------- events ---------------- */

  test('past events are never advertised', () => {
    const events = [
      event('past', '2026-08-01T19:00:00Z'),
      event('soon', '2026-08-20T19:00:00Z'),
      event('later', '2026-09-05T19:00:00Z'),
    ];
    const chosen = eventsForNewsletter(events, now).map((e) => e.id);
    assert.deepEqual(chosen, ['soon', 'later'], 'a finished event must not be in the email');
  });

  test('events are ordered soonest first and capped', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      event(`e${i}`, new Date(now.getTime() + (20 - i) * 86_400_000).toISOString())
    );
    const chosen = eventsForNewsletter(events, now, 6);
    assert.equal(chosen.length, 6);
    assert.deepEqual(
      [...chosen].sort((a, b) => a.date.localeCompare(b.date)).map((e) => e.id),
      chosen.map((e) => e.id),
      'soonest first'
    );
  });

  /* ---------------- unsubscribe ---------------- */

  test('an unsubscribe token verifies only for the uid it was signed for', () => {
    const token = signUnsubscribe('user-a');
    assert.ok(token);
    assert.equal(verifyUnsubscribe('user-a', token), true);
    assert.equal(verifyUnsubscribe('user-b', token), false, 'a token must not unsubscribe someone else');
  });

  test('a tampered or absent token is refused', () => {
    const token = signUnsubscribe('user-a')!;
    assert.equal(verifyUnsubscribe('user-a', token.slice(0, -1) + '0'), false);
    assert.equal(verifyUnsubscribe('user-a', ''), false);
    assert.equal(verifyUnsubscribe('user-a', null), false);
    assert.equal(verifyUnsubscribe('user-a', 'short'), false, 'a length mismatch must not throw');
  });

  test('every newsletter carries a working unsubscribe link', () => {
    const url = unsubscribeUrl('user-a', site);
    assert.ok(url, 'a marketing email without an unsubscribe link is spam, not marketing');
    const content = buildNewsletter({
      articles: [article('x')],
      events: [event('e1', '2026-08-20T19:00:00Z')],
      siteUrl: site,
      unsubscribeUrl: url,
    });
    // The href is HTML-escaped, so `&` between the query parameters becomes `&amp;`.
    // That is correct markup and mail clients unescape it — assert on the escaped form
    // rather than weakening the escaping to satisfy a naive comparison.
    const escaped = url!.replace(/&/g, '&amp;');
    assert.ok(content.html.includes(escaped), 'the HTML part must carry it');
    assert.ok(content.html.includes('u=user-a') && content.html.includes('t='), 'both params present');
    assert.ok(content.text.includes(url!), 'the plain-text part must carry it too');
  });

  test('RFC 8058 one-click headers are present', () => {
    const headers = unsubscribeHeaders('user-a', site)!;
    assert.ok(headers['List-Unsubscribe'].includes('/api/unsubscribe'));
    assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  });

  /* ---------------- the email itself ---------------- */

  test('both a text and an HTML part are produced', () => {
    const content = buildNewsletter({
      articles: [article('x')],
      events: [event('e1', '2026-08-20T19:00:00Z')],
      siteUrl: site,
      unsubscribeUrl: unsubscribeUrl('u', site),
    });
    assert.ok(content.text.length > 100, 'a plain-text alternative is not optional');
    assert.ok(content.html.includes('<!doctype html>'));
    assert.ok(content.subject.length > 0 && content.subject.length < 120);
  });

  test('a free ticket is described as Free, not £0.00', () => {
    const content = buildNewsletter({
      articles: [],
      events: [event('free', '2026-08-20T19:00:00Z', 0)],
      siteUrl: site,
      unsubscribeUrl: null,
    });
    assert.ok(content.text.includes('Free'));
    assert.ok(!content.text.includes('£0.00'));
  });

  test('an email with no events still sends something worth reading', () => {
    const content = buildNewsletter({
      articles: [article('x'), article('y')],
      events: [],
      siteUrl: site,
      unsubscribeUrl: unsubscribeUrl('u', site),
    });
    assert.ok(content.html.includes('Title x'));
    assert.ok(!content.html.includes('On sale now'), 'no empty section header');
  });

  test('recipient-supplied values are HTML-escaped', () => {
    const content = buildNewsletter({
      articles: [],
      events: [
        { ...(event('e1', '2026-08-20T19:00:00Z') as object), title: '<script>alert(1)</script>' } as never,
      ],
      siteUrl: site,
      unsubscribeUrl: null,
    });
    assert.ok(!content.html.includes('<script>alert(1)</script>'), 'an event title must not inject markup');
    assert.ok(content.html.includes('&lt;script&gt;'));
  });

  test('the week id advances once per week, not per day', () => {
    const monday = weekIndex(new Date('2026-08-10T00:00:00Z'));
    const friday = weekIndex(new Date('2026-08-14T00:00:00Z'));
    const nextWeek = weekIndex(new Date('2026-08-20T00:00:00Z'));
    assert.equal(monday, friday, 'the same week must produce the same id');
    assert.notEqual(monday, nextWeek);
  });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
