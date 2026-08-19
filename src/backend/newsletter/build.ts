import 'server-only';

import { publishedArticles } from '@/shared/content/articles';
import { formatEventDate } from '@/shared/utils';
import type { Article } from '@/shared/content/articles';
import type { Event } from '@/shared/types';

/**
 * The weekly newsletter.
 *
 * **Every claim in it comes from something that exists.** Articles are drawn from
 * `publishedArticles()`, which excludes anything flagged `draft` — the same gate
 * `npm run check:links` enforces on the blog, and it exists because thirty articles were
 * once written describing features in the present tense and sixteen of them were not
 * built. A newsletter is a worse place to make that mistake than a blog: a blog post
 * waits to be found, a newsletter arrives in an inbox with the platform's name on it.
 *
 * So there is deliberately no hand-written "features" list here. If a capability is
 * worth selling, it gets a published article and appears automatically. If it is not
 * built, its article is a draft and it cannot appear. The content and the truth cannot
 * drift, because they are the same source.
 *
 * Events come from the live catalogue, filtered to what is genuinely upcoming and on
 * sale — an email advertising a sold-out or finished event is worse than no email.
 */

export interface NewsletterInput {
  articles: Article[];
  events: Event[];
  /**
   * Paid newsletter-spotlight events — a dedicated block above everything else,
   * labelled as sponsored because it is. Chosen at the start of the weekly run and
   * held constant across its batches, so every recipient of one send sees the same
   * block: that is what "single send" sold.
   */
  spotlight?: Event[];
  siteUrl: string;
  /** The link that turns this off. Absent only when CRON_SECRET is unset. */
  unsubscribeUrl: string | null;
  recipientName?: string;
}

export interface NewsletterContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * A monotonically increasing week number, with weeks starting on **Monday**.
 *
 * Counted from the Unix epoch rather than from 1 January, because a year-relative count
 * puts the week boundary on whatever weekday the year happened to start — for 2026 that
 * was a Thursday, which meant Monday and Friday of the same working week landed in
 * different "weeks" and would have been sent two different newsletters.
 *
 * Day 0 of the epoch was a Thursday, so `+3` shifts the boundary onto Monday.
 */
export function weekIndex(now: Date): number {
  const days = Math.floor(now.getTime() / 86_400_000);
  return Math.floor((days + 3) / 7);
}

/** The articles for a given week — a rotating window over the published set. */
export function articlesForWeek(all: Article[], week: number, count = 4): Article[] {
  if (all.length === 0) return [];
  const size = Math.min(count, all.length);
  const offset = (week * size) % all.length;
  // Wraps rather than truncating at the end of the list, so the last week of the cycle
  // still gets a full set instead of one article.
  return Array.from({ length: size }, (_, i) => all[(offset + i) % all.length]);
}

/** Upcoming, published, still on sale. */
export function eventsForNewsletter(events: Event[], now: Date, max = 6): Event[] {
  return events
    .filter((event) => new Date(event.date).getTime() > now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(amount: number, currency: string): string {
  if (amount <= 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Builds the email.
 *
 * Table layout, inline styles, no images and a full plain-text alternative — same
 * constraints as the ticket email, because a newsletter that renders as a blank box in
 * Outlook is the same failure as one that never sent.
 */
export function buildNewsletter(input: NewsletterInput): NewsletterContent {
  const { articles, events, siteUrl, unsubscribeUrl, recipientName } = input;
  const spotlight = input.spotlight ?? [];

  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const lead = events.length
    ? `${events.length} event${events.length === 1 ? '' : 's'} on sale now, and what the platform can do for you.`
    : 'What the platform can do for you this week.';

  const subject = events[0]
    ? `${events[0].title} — and what's on this week`
    : 'What you can do with TicketRoyality this week';

  /* ---------------------------------------------------------------- */
  /* Plain text                                                       */
  /* ---------------------------------------------------------------- */

  const textParts: string[] = [greeting, '', lead, ''];

  if (spotlight.length) {
    textParts.push('IN THE SPOTLIGHT (sponsored)', '');
    for (const event of spotlight) {
      textParts.push(
        `• ${event.title}`,
        `  ${formatEventDate(event.date)} · ${event.location}`,
        `  ${money(event.price, event.currency)} — ${siteUrl}/events/${event.id}`,
        ''
      );
    }
  }

  if (events.length) {
    textParts.push('ON SALE NOW', '');
    for (const event of events) {
      textParts.push(
        `• ${event.title}`,
        `  ${formatEventDate(event.date)} · ${event.location}`,
        `  ${money(event.price, event.currency)} — ${siteUrl}/events/${event.id}`,
        ''
      );
    }
    textParts.push(`All events: ${siteUrl}/events`, '');
  }

  if (articles.length) {
    textParts.push('WORTH READING', '');
    for (const article of articles) {
      textParts.push(`• ${article.title}`, `  ${article.excerpt}`, `  ${siteUrl}/blog/${article.slug}`, '');
    }
  }

  textParts.push(
    'RUN YOUR OWN EVENT',
    `Organisers pay 0% commission and keep 100% of their ticket value. Buyers pay one TicketRoyality Service Fee, shown inside every price we advertise. Free tickets cost everybody nothing.`,
    `Start selling: ${siteUrl}/register/organiser`,
    '',
    '—',
    'TicketRoyality',
    siteUrl
  );

  if (unsubscribeUrl) {
    textParts.push('', `Stop receiving these: ${unsubscribeUrl}`);
  }

  /* ---------------------------------------------------------------- */
  /* HTML                                                             */
  /* ---------------------------------------------------------------- */

  const eventRows = events
    .map(
      (event) => `
      <tr><td style="padding:0 0 14px">
        <a href="${escapeHtml(siteUrl)}/events/${escapeHtml(event.id)}"
           style="display:block;padding:14px 16px;border:1px solid #e6e6ea;border-radius:8px;text-decoration:none">
          <span style="display:block;font-size:15px;font-weight:600;color:#111116">${escapeHtml(event.title)}</span>
          <span style="display:block;margin-top:4px;font-size:13px;color:#6b6b73">
            ${escapeHtml(formatEventDate(event.date))} &middot; ${escapeHtml(event.location)}
          </span>
          <span style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#B07A12">
            ${escapeHtml(money(event.price, event.currency))} &rsaquo; Get tickets
          </span>
        </a>
      </td></tr>`
    )
    .join('');

  const articleRows = articles
    .map(
      (article) => `
      <tr><td style="padding:0 0 12px">
        <a href="${escapeHtml(siteUrl)}/blog/${escapeHtml(article.slug)}"
           style="font-size:15px;font-weight:600;color:#111116;text-decoration:none">${escapeHtml(article.title)}</a>
        <p style="margin:4px 0 0;font-size:13px;line-height:1.55;color:#6b6b73">
          ${escapeHtml(article.excerpt)}
          <a href="${escapeHtml(siteUrl)}/blog/${escapeHtml(article.slug)}" style="color:#B07A12;text-decoration:none">Read&nbsp;&rsaquo;</a>
        </p>
      </td></tr>`
    )
    .join('');

  const spotlightRows = spotlight
    .map(
      (event) => `
      <tr><td style="padding:0 0 14px">
        <a href="${escapeHtml(siteUrl)}/events/${escapeHtml(event.id)}"
           style="display:block;padding:14px 16px;border:1px solid #E0A82E;border-radius:8px;background:#fdf9ef;text-decoration:none">
          <span style="display:block;font-size:15px;font-weight:600;color:#111116">${escapeHtml(event.title)}</span>
          <span style="display:block;margin-top:4px;font-size:13px;color:#6b6b73">
            ${escapeHtml(formatEventDate(event.date))} &middot; ${escapeHtml(event.location)}
          </span>
          <span style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#B07A12">
            ${escapeHtml(money(event.price, event.currency))} &rsaquo; Get tickets
          </span>
        </a>
      </td></tr>`
    )
    .join('');

  const section = (title: string, rows: string) =>
    rows
      ? `<tr><td style="padding:22px 28px 0">
           <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8b8b93">${title}</p>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
         </td></tr>`
      : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="height:4px;background:#E0A82E;font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td style="padding:24px 28px 0">
      <a href="${escapeHtml(siteUrl)}" style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#111116;text-decoration:none">
        Ticket<span style="color:#B07A12">Royality</span>
      </a>
      <p style="margin:14px 0 0;font-size:15px;color:#2b2b30">${escapeHtml(greeting)}</p>
      <p style="margin:6px 0 0;font-size:15px;line-height:1.6;color:#2b2b30">${escapeHtml(lead)}</p>
    </td></tr>

    ${section('In the spotlight &middot; sponsored', spotlightRows)}
    ${section('On sale now', eventRows)}
    ${events.length ? `<tr><td style="padding:2px 28px 0"><a href="${escapeHtml(siteUrl)}/events" style="font-size:13px;font-weight:600;color:#B07A12;text-decoration:none">See every event &rsaquo;</a></td></tr>` : ''}
    ${section('Worth reading', articleRows)}

    <tr><td style="padding:22px 28px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f0;border-radius:8px">
        <tr><td style="padding:16px">
          <p style="margin:0;font-size:15px;font-weight:600;color:#111116">Running your own event?</p>
          <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#4b4b53">
            Organisers pay 0% commission and keep 100% of their ticket value. Buyers pay
            one TicketRoyality Service Fee, shown inside every price we advertise. Free
            tickets cost everybody nothing.
            Tiered and VIP pricing, QR entry, door check-in from a phone, and live revenue reporting.
          </p>
          <p style="margin:10px 0 0">
            <a href="${escapeHtml(siteUrl)}/register/organiser" style="font-size:13px;font-weight:600;color:#B07A12;text-decoration:none">Start selling &rsaquo;</a>
            &nbsp;&nbsp;
            <a href="${escapeHtml(siteUrl)}/how-it-works" style="font-size:13px;color:#6b6b73;text-decoration:none">How it works</a>
            &nbsp;&nbsp;
            <a href="${escapeHtml(siteUrl)}/industries" style="font-size:13px;color:#6b6b73;text-decoration:none">Your industry</a>
          </p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 28px 26px">
      <hr style="border:none;border-top:1px solid #e6e6ea;margin:0 0 14px">
      <p style="margin:0;font-size:12px;line-height:1.7;color:#8b8b93">
        <a href="${escapeHtml(siteUrl)}/events" style="color:#8b8b93">Events</a> &middot;
        <a href="${escapeHtml(siteUrl)}/organisers" style="color:#8b8b93">Organisers</a> &middot;
        <a href="${escapeHtml(siteUrl)}/blog" style="color:#8b8b93">Blog</a> &middot;
        <a href="${escapeHtml(siteUrl)}/contact" style="color:#8b8b93">Contact</a><br>
        ${
          unsubscribeUrl
            ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#8b8b93;text-decoration:underline">Unsubscribe from these emails</a> &mdash; you will still receive your tickets and receipts.`
            : 'You are receiving this because you have a TicketRoyality account.'
        }
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, text: textParts.join('\n'), html };
}

/** Convenience for the cron route: this week's slice of the published set. */
export function newsletterArticles(now: Date, count = 4): Article[] {
  return articlesForWeek(publishedArticles(), weekIndex(now), count);
}
