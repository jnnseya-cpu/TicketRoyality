import 'server-only';

import type { CommsEvent, Severity } from '@/shared/comms/types';

/**
 * The generic catalogue-event email.
 *
 * `functions/src/templates.ts` builds the ticket itself — a bespoke layout, because
 * that message *is* the product. This one covers the other hundred-odd events in the
 * catalogue: refund processed, payout sent, venue changed, password changed. Those need
 * to be recognisably from the same platform, correct, and impossible to get wrong when
 * a new catalogue entry is added — not individually art-directed.
 *
 * Same constraints as the ticket email and for the same reasons: table layout, inline
 * styles, no external CSS, no web fonts, no images. Every one of those is blocked by
 * default in a large share of mail clients, and a notification that renders as a blank
 * box is the same failure as not sending it.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Severity drives one accent colour. Anything more becomes a design system in email. */
const ACCENT: Record<Severity, string> = {
  info: '#8b8b93',
  success: '#2e7d32',
  warning: '#E0A82E',
  critical: '#c62828',
};

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateInput {
  event: CommsEvent;
  /** Already-interpolated subject, from `render()` in the shared catalogue. */
  subject: string;
  /** Body lines. Each becomes a paragraph. */
  body: string[];
  /** Optional call to action. */
  action?: { label: string; url: string };
  siteUrl: string;
}

export function catalogueEmail(input: TemplateInput): RenderedEmail {
  const { event, subject, body, action, siteUrl } = input;
  const accent = ACCENT[event.severity];

  const textLines = [
    subject,
    '',
    ...body,
    '',
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    '—',
    'TicketRoyality',
    siteUrl,
  ];

  // Mandatory messages carry no unsubscribe line, and saying otherwise would be a lie:
  // a contractual or security message is sent whatever the preferences say. Offering an
  // opt-out that is not honoured is worse than offering none.
  if (!event.mandatory) {
    textLines.push('', `Manage which emails you receive: ${siteUrl}/account`);
  } else {
    textLines.push('', 'This is a service message about your account and cannot be turned off.');
  }

  const paragraphs = body
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2b30">${escapeHtml(line)}</p>`
    )
    .join('');

  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:6px;background:#111116">
           <a href="${escapeHtml(action.url)}"
              style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#F5A524;text-decoration:none">
             ${escapeHtml(action.label)}
           </a>
         </td></tr>
       </table>`
    : '';

  const footer = event.mandatory
    ? 'This is a service message about your account and cannot be turned off.'
    : `<a href="${escapeHtml(siteUrl)}/account" style="color:#8b8b93">Manage which emails you receive</a>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="height:4px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:24px 28px 8px">
      <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#111116">
        Ticket<span style="color:#F5A524">Royality</span>
      </p>
    </td></tr>
    <tr><td style="padding:8px 28px 4px">
      <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:#111116">${escapeHtml(subject)}</h1>
      ${paragraphs}
      ${button}
    </td></tr>
    <tr><td style="padding:18px 28px 26px">
      <hr style="border:none;border-top:1px solid #e6e6ea;margin:0 0 14px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#8b8b93">
        ${footer}<br>
        <a href="${escapeHtml(siteUrl)}" style="color:#8b8b93">${escapeHtml(siteUrl.replace(/^https?:\/\//, ''))}</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, text: textLines.join('\n'), html };
}
