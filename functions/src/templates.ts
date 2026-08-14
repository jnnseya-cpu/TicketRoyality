import type { TicketDoc } from './domain';

/**
 * The ticket delivery email.
 *
 * `ticket.issued` in the shared catalogue carries the note "This IS the product.
 * Delivery failure is indistinguishable from fraud." That is the whole design brief for
 * this file: the message has to survive a bad email client, a phone on 2G and a
 * recipient who never installs anything.
 *
 * So it is a table-based HTML layout with inline styles and a full plain-text
 * alternative. No external CSS, no web fonts, no images — every one of those is blocked
 * by default in a large share of mail clients, and a ticket email that renders as a
 * blank box is the same failure as not sending it.
 *
 * The QR code is deliberately **not** embedded. It is currently a static unsigned
 * payload (see /STATUS.md), so putting it in an email would place a working credential
 * in an inbox that gets forwarded. The email links to the wallet instead, where the
 * code is shown behind authentication.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    // An unrecognised currency code must not lose the number.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export interface TicketEmail {
  subject: string;
  text: string;
  html: string;
}

export function ticketIssuedEmail(tickets: TicketDoc[], siteUrl: string): TicketEmail {
  const first = tickets[0];
  const plural = tickets.length > 1;
  const subject = `Your ticket${plural ? 's' : ''} for ${first.eventTitle}`;
  const walletUrl = `${siteUrl.replace(/\/$/, '')}/dashboard/customer/wallet`;
  const total = tickets.reduce((sum, t) => sum + t.price, 0);

  const lines = tickets.map(
    (t) => `  ${t.reference}  ${t.tierName}${t.seat ? `  Seat ${t.seat}` : ''}`
  );

  const text = [
    `Your ticket${plural ? 's' : ''} for ${first.eventTitle}`,
    '',
    `${formatDate(first.eventDate)}`,
    `${first.eventLocation}`,
    '',
    `Ticket reference${plural ? 's' : ''}:`,
    ...lines,
    '',
    `Total paid: ${formatMoney(total, first.currency)}`,
    '',
    `Show the QR code from your account at the door:`,
    walletUrl,
    '',
    `Organised by ${first.organizerName}.`,
    '',
    'This is a transactional message about a purchase you made. It is not marketing',
    'and cannot be unsubscribed from.',
  ].join('\n');

  const rows = tickets
    .map(
      (t) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e5e5;">
                  <span style="font-family:monospace;font-size:16px;font-weight:bold;color:#111;">${escapeHtml(t.reference)}</span><br>
                  <span style="font-size:14px;color:#666;">${escapeHtml(t.tierName)}${t.seat ? ` &middot; Seat ${escapeHtml(t.seat)}` : ''}</span>
                </td>
                <td align="right" style="padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:14px;color:#666;">
                  ${escapeHtml(formatMoney(t.price, t.currency))}
                </td>
              </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;">
          <tr>
            <td>
              <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;">You're going to ${escapeHtml(first.eventTitle)}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#666;">
                ${escapeHtml(formatDate(first.eventDate))}<br>
                ${escapeHtml(first.eventLocation)}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
                <tr>
                  <td style="padding:12px 0;font-size:15px;font-weight:bold;">Total paid</td>
                  <td align="right" style="padding:12px 0;font-size:15px;font-weight:bold;">${escapeHtml(formatMoney(total, first.currency))}</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background:#111;border-radius:6px;">
                    <a href="${escapeHtml(walletUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">
                      Open your ticket${plural ? 's' : ''}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.5;">
                Show the QR code from your account at the door. Keep it in the app rather
                than as a screenshot &mdash; a photograph of a code is not a ticket.
              </p>

              <p style="margin:0;padding-top:20px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;line-height:1.5;">
                Organised by ${escapeHtml(first.organizerName)}.<br>
                This is a transactional message about a purchase you made. It is not
                marketing and cannot be unsubscribed from.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
