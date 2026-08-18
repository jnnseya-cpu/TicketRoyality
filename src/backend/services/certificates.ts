import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Certificates of attendance — the conferences card's "Not yet".
 *
 * ## What a certificate is here
 *
 * A server-rendered page stating that a named person attended a named event, listing
 * the sessions they were actually scanned into, carrying a verification code. The page
 * is print-styled, and every browser prints to PDF — which is why there is no PDF
 * library, no generation queue and no file storage: the certificate is the page, and
 * the page can always be re-rendered from the records it states.
 *
 * ## Why a code rather than a login
 *
 * The person who needs to *read* a certificate is rarely the person who earned it — it
 * is an employer, a CPD assessor, a professional body. They have no account here and
 * must not need one. So the URL carries an HMAC over the ticket id: unguessable without
 * the key, checkable by anyone holding the link, revealing nothing beyond what the page
 * itself states. The owner mints their link through an authenticated route; the link
 * then verifies for whoever it is shown to.
 *
 * Signed with `QR_SIGNING_KEY` — attendance proof is exactly what that key already
 * protects at the door. A distinct label keeps a certificate code from ever validating
 * as a ticket signature or the reverse.
 */

function key(): string | undefined {
  return process.env.QR_SIGNING_KEY || undefined;
}

export function certificateCode(ticketId: string): string | undefined {
  const secret = key();
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(`certificate:v1:${ticketId}`).digest('base64url').slice(0, 24);
}

export function certificateCodeValid(ticketId: string, given: string): boolean {
  const expected = certificateCode(ticketId);
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
