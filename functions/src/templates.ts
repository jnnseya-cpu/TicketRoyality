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

export function ticketIssuedEmail(
  tickets: TicketDoc[],
  siteUrl: string,
  /**
   * The all-in figures from the payment's fee snapshot, major units. When present the
   * email itemises face value + service fee + total paid, so the receipt in the inbox
   * agrees with the total the checkout showed and the card was charged. Absent for
   * payments recorded before the snapshot existed, which show face value only.
   */
  fee?: { serviceFee: number; totalPaid: number }
): TicketEmail {
  const first = tickets[0];
  const plural = tickets.length > 1;
  const subject = `Your ticket${plural ? 's' : ''} for ${first.eventTitle}`;
  const walletUrl = `${siteUrl.replace(/\/$/, '')}/dashboard/customer/wallet`;
  const total = tickets.reduce((sum, t) => sum + t.price, 0);
  const totalPaid = fee ? fee.totalPaid : total;

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
    ...(fee
      ? [
          `Ticket value: ${formatMoney(total, first.currency)}`,
          `Service fee: ${formatMoney(fee.serviceFee, first.currency)}`,
        ]
      : []),
    `Total paid: ${formatMoney(totalPaid, first.currency)}`,
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
                ${
                  fee
                    ? `<tr>
                  <td style="padding:10px 0 0;font-size:14px;color:#666;">Service fee</td>
                  <td align="right" style="padding:10px 0 0;font-size:14px;color:#666;">${escapeHtml(formatMoney(fee.serviceFee, first.currency))}</td>
                </tr>`
                    : ''
                }
                <tr>
                  <td style="padding:12px 0;font-size:15px;font-weight:bold;">Total paid</td>
                  <td align="right" style="padding:12px 0;font-size:15px;font-weight:bold;">${escapeHtml(formatMoney(totalPaid, first.currency))}</td>
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

/* -------------------------------------------------------------------------- */
/* Notices — refund processed, and a payment that produced no ticket           */
/* -------------------------------------------------------------------------- */

/**
 * A plain notice email.
 *
 * These correspond to `order.refund.processed` and `order.failed` / `oversold` in the
 * shared comms catalogue. They live here rather than going through the app's
 * `dispatch()` because `firebase deploy` uploads only this directory — the functions
 * package cannot import from `src/`, and refunds are settled here, in the same
 * transaction that returns the inventory.
 *
 * Same constraints as the ticket email: table layout, inline styles, no images, full
 * plain-text alternative. A notice that renders as a blank box is the same failure as
 * not sending it.
 */
function noticeEmail(
  subject: string,
  heading: string,
  paragraphs: string[],
  accent: string,
  siteUrl: string
): TicketEmail {
  const text = [subject, '', ...paragraphs, '', '—', 'TicketRoyality', siteUrl].join('\n');

  const body = paragraphs
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2b30">${escapeHtml(line)}</p>`
    )
    .join('');

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
      <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:#111116">${escapeHtml(heading)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px 26px">
      <hr style="border:none;border-top:1px solid #e6e6ea;margin:0 0 14px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#8b8b93">
        This is a service message about your order and cannot be turned off.<br>
        <a href="${escapeHtml(siteUrl)}" style="color:#8b8b93">${escapeHtml(siteUrl.replace(/^https?:\/\//, ''))}</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}

/** `order.refund.processed`. Mandatory — the customer's money moved. */
export function refundProcessedEmail(
  tickets: TicketDoc[],
  siteUrl: string
): TicketEmail | null {
  const first = tickets[0];
  if (!first) return null;

  const total = tickets.reduce((sum, ticket) => sum + ticket.price, 0);
  const money = formatMoney(total, first.currency);

  return noticeEmail(
    `Your refund of ${money} is on its way`,
    `Refund confirmed — ${first.eventTitle}`,
    [
      `We have refunded ${money} for ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} to ${first.eventTitle}.`,
      // Said explicitly because "refunded" and "in my account" are not the same day,
      // and the gap between them is the most common support message a refund creates.
      'Refunds return to the card or account you paid from. Your bank usually shows it within five to ten working days.',
      tickets.length === 1
        ? `The ticket ${first.reference} is no longer valid for entry.`
        : `Those tickets are no longer valid for entry.`,
    ],
    '#2e7d32',
    siteUrl
  );
}

/**
 * `order.failed` / the oversold case.
 *
 * Sent when money has moved and no ticket can be issued. The catalogue note on
 * `ticket.issued` says delivery failure is indistinguishable from fraud; silence here
 * is exactly that, so this says plainly that a refund is coming and that no action is
 * needed. It never promises a ticket.
 */
export function issuanceFailedEmail(
  details: { eventTitle: string; quantity: number; oversold: boolean },
  siteUrl: string
): TicketEmail {
  const reason = details.oversold
    ? 'The last tickets in that tier sold while your payment was completing, so we could not issue yours.'
    : 'We could not issue your tickets because of a problem on our side.';

  return noticeEmail(
    'We could not issue your tickets — a refund is on its way',
    `About your order for ${details.eventTitle}`,
    [
      reason,
      'You have not been charged for tickets you did not receive: we are refunding your payment in full. There is nothing you need to do.',
      'Refunds usually appear within five to ten working days. If yours has not arrived by then, reply to this email and we will chase it.',
    ],
    '#c62828',
    siteUrl
  );
}
