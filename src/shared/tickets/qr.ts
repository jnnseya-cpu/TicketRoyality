/**
 * The ticket QR payload.
 *
 * ## What signing does and does not buy
 *
 * It is worth being exact, because the gap was described in `STATUS.md` as "a screenshot
 * is a working ticket" and that framing led somewhere misleading.
 *
 * A QR that carries only identifiers is **not** forgeable into a free entry: redemption
 * looks the ticket up and requires `status: 'valid'` on a document that exists, for the
 * event whose door is scanning. Inventing a ticket id gets you refused.
 *
 * What the signature actually prevents is **editing a real payload**. Without it, anyone
 * holding one genuine ticket can change the `e` field and probe other doors, or swap the
 * `t` field to a guessed id and make the scanner query the database on their behalf. The
 * signature binds ticket id and event id together, so the payload is either exactly what
 * was issued or it is rejected before any lookup happens.
 *
 * And a screenshot still works **once**. That is the design — single-use redemption is
 * what limits it, and the terms of service say so. Defeating a shared screenshot
 * entirely needs a rotating code, which is a different feature and is not built.
 *
 * ## Where the key lives
 *
 * `QR_SIGNING_KEY` is server-only and must never reach the browser, so the signature is
 * computed at issuance in `functions/` and stored on the ticket. The wallet renders what
 * it was given; the door posts the payload to a server route that recomputes the HMAC.
 * No signing or verification ever happens on a client.
 */

export const QR_VERSION = 2;

export interface TicketQrPayload {
  v: number;
  /** Ticket id. */
  t: string;
  /** Event id — bound into the signature so a payload cannot be pointed at another door. */
  e: string;
  /** Human-readable reference, shown to the door staff. */
  r: string;
  /** HMAC-SHA256 of `v|t|e`, base64url, truncated. Absent on v1 tickets. */
  s?: string;
}

/**
 * The exact bytes that get signed.
 *
 * Field order is fixed and the separator cannot appear in a Firestore id, so two
 * different tickets can never produce the same signing input. Shared with
 * `functions/src/qr.ts`, which must stay byte-identical — the contract guard in
 * `backend/services/qr-contract.ts` is what stops the two drifting.
 */
export function qrSigningInput(version: number, ticketId: string, eventId: string): string {
  return `${version}|${ticketId}|${eventId}`;
}

export function encodeTicketQr(payload: TicketQrPayload): string {
  return JSON.stringify(payload);
}

export type QrDecode =
  | { ok: true; payload: TicketQrPayload }
  | { ok: false; reason: 'empty' | 'malformed' | 'not-a-ticket' };

/**
 * Parse a scanned string. Deliberately total — a camera pointed at a shop receipt is a
 * normal event at a door, not an exception worth throwing.
 */
export function decodeTicketQr(raw: string): QrDecode {
  if (!raw || !raw.trim()) return { ok: false, reason: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const p = parsed as Partial<TicketQrPayload>;
  if (!p || typeof p.t !== 'string' || !p.t) return { ok: false, reason: 'not-a-ticket' };

  return {
    ok: true,
    payload: {
      v: typeof p.v === 'number' ? p.v : 1,
      t: p.t,
      e: typeof p.e === 'string' ? p.e : '',
      r: typeof p.r === 'string' ? p.r : p.t,
      s: typeof p.s === 'string' ? p.s : undefined,
    },
  };
}
