import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Ticket QR signing, function side.
 *
 * `functions/` is a separate deployable package and cannot import from `src/`, so the
 * signing input format is restated here. `src/backend/services/qr-contract.ts` makes a
 * divergence between the two a compile error in the application rather than a door that
 * rejects every genuine ticket at an event.
 */

export const QR_VERSION = 2;

/** Must stay byte-identical to `qrSigningInput` in `src/shared/tickets/qr.ts`. */
export function qrSigningInput(version: number, ticketId: string, eventId: string): string {
  return `${version}|${ticketId}|${eventId}`;
}

export function isQrSigningConfigured(): boolean {
  return Boolean(process.env.QR_SIGNING_KEY);
}

/**
 * Sign a ticket. Returns undefined when no key is configured.
 *
 * Undefined rather than throwing, deliberately: a missing key must not stop a paid-for
 * ticket being issued. An unsigned ticket still cannot be forged — redemption checks the
 * document exists and is valid — it just loses the tamper-binding. The door route
 * records the difference so the gap is visible rather than silent.
 */
export function signTicket(ticketId: string, eventId: string): string | undefined {
  const key = process.env.QR_SIGNING_KEY;
  if (!key) return undefined;

  return createHmac('sha256', key)
    .update(qrSigningInput(QR_VERSION, ticketId, eventId))
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time comparison. A byte-by-byte check leaks the signature one byte at a time. */
export function verifyTicketSignature(
  ticketId: string,
  eventId: string,
  signature: string | undefined
): boolean {
  const expected = signTicket(ticketId, eventId);
  if (!expected || !signature) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
