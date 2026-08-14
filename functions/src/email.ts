import { createTransport, type Transporter } from 'nodemailer';

/**
 * Email delivery over SMTP.
 *
 * SMTP rather than an email API because of the five-vendor constraint: Hostinger
 * already supplies the domain and its mailboxes, so sending through it adds a
 * capability without adding a supplier. Resend, SendGrid and Postmark would each be a
 * sixth vendor with its own account and invoice. `nodemailer` is a library, not a
 * service.
 *
 * The transporter is created once per instance and reused. Building one per message
 * opens a new TLS connection and authenticates again for every send, which is slow and
 * is what gets a sending IP rate-limited by its own provider.
 */

let transporter: Transporter | undefined;

/**
 * Drops the cached transporter so the next send rebuilds from current env.
 *
 * Exists for tests, which point the sender at different ports within one process.
 * Exported rather than worked around with cache-busting import specifiers, because
 * those do not typecheck and the module cache is not a supported test seam.
 */
export function resetTransport(): void {
  transporter?.close();
  transporter = undefined;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transport(): Transporter {
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT ?? 465);

  transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 negotiates STARTTLS after connecting. Getting this
    // backwards fails with a timeout rather than a clear error, which is why it is
    // derived from the port instead of being a separate setting somebody can mismatch.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    // Bounded so a hung SMTP server cannot hold a function instance open until the
    // platform timeout.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Sends one message.
 *
 * Never throws. Delivery failure must not roll back a ticket that has already been
 * issued and paid for — the ticket exists in the buyer's account either way, and an
 * exception here would retry the whole issuance path for a problem issuance cannot fix.
 * The caller records the outcome and the reconciliation sweep retries the send.
 */
export async function send(email: Email): Promise<SendOutcome> {
  if (!isEmailConfigured()) {
    return { status: 'skipped', reason: 'SMTP is not configured' };
  }
  if (!email.to) {
    return { status: 'skipped', reason: 'no recipient address' };
  }

  try {
    const info = await transport().sendMail({
      from: process.env.EMAIL_FROM ?? 'TicketRoyality <info@ticketroyality.com>',
      to: email.to,
      subject: email.subject,
      // Both parts, always. A text/plain alternative is what stops a transactional
      // message scoring as spam, and it is the version that survives a client which
      // blocks HTML.
      text: email.text,
      html: email.html,
    });

    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
