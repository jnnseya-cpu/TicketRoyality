import 'server-only';

import { createTransport, type Transporter } from 'nodemailer';

/**
 * SMTP email for the application.
 *
 * A deliberate near-twin of `functions/src/email.ts` rather than a shared module.
 * `firebase deploy` uploads only the `functions/` directory, so that package cannot
 * import from `src/`, and `src/` importing from `functions/` would drag a separately
 * versioned `node_modules` into the Next.js build. The duplication is two dozen lines
 * of transport configuration; the alternative is a build that works locally and breaks
 * in exactly one of the two deployment targets.
 *
 * SMTP rather than an email API because Hostinger already supplies the domain and its
 * mailboxes (CLAUDE.md §1). Resend, SendGrid and Postmark would each be a sixth vendor.
 * `nodemailer` is a library, not a service.
 */

let transporter: Transporter | undefined;

/** Drops the cached transporter so the next send rebuilds from current env. For tests. */
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
    // derived from the port rather than being a setting somebody can mismatch.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
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
 * Sends one email. **Never throws.**
 *
 * A failed notification must not take down the request that triggered it — a refund
 * that succeeded and then 500ed because the confirmation email bounced is a worse
 * outcome than a refund with no email. The caller records the outcome instead.
 */
export async function send(email: Email): Promise<SendOutcome> {
  if (!isEmailConfigured()) {
    return { status: 'skipped', reason: 'SMTP is not configured' };
  }
  if (!email.to || !email.to.includes('@')) {
    return { status: 'skipped', reason: 'no recipient address' };
  }

  try {
    const info = await transport().sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[comms/email] send failed', { to: email.to, subject: email.subject, reason });
    return { status: 'failed', reason };
  }
}
