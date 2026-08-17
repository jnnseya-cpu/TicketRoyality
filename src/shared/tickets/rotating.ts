/**
 * Rotating ticket codes.
 *
 * ## The gap this closes
 *
 * A signed static QR cannot be forged, and single-use redemption means a shared
 * screenshot only gets one person in. But that one person might be the wrong one: the
 * buyer photographs their ticket, sends it to a friend, and whoever reaches the door
 * first is admitted. The real holder is then refused with "already scanned".
 *
 * A rotating code makes the screenshot stale. The QR changes every 30 seconds, so a
 * picture taken in the queue is worthless by the time it is forwarded — the sharer has
 * to be standing next to the person they are letting in, at which point they may as well
 * have walked them through the door themselves.
 *
 * ## Why a seed and not a server round-trip
 *
 * The wallet could ask the server for a fresh code every 30 seconds, but a phone in a
 * basement venue with no signal would show nothing at exactly the moment it is needed.
 * Instead each ticket carries a rotation seed, handed only to its owner, and the wallet
 * computes codes locally — so the ticket keeps working with the phone in aeroplane mode.
 *
 * The seed is not a secret from the buyer, and it does not need to be: they already hold
 * the ticket. It is a secret from anyone they send a picture to, which is the whole
 * point. Sharing the seed itself is equivalent to sharing an account password, and the
 * industry accepts that boundary for the same reason.
 *
 * ## Clock skew
 *
 * Phones drift. The door accepts the current window and one either side, so a device up
 * to 30 seconds out still scans. Wider than that starts to reopen the forwarding window
 * it exists to close; narrower turns a slightly slow phone into a refused customer.
 *
 * Isomorphic on purpose — the wallet computes with Web Crypto, the door recomputes with
 * `node:crypto`, and both must agree exactly.
 */

export const ROTATION_VERSION = 3;

/** Seconds per code. Short enough to spoil a forward, long enough to scan. */
export const ROTATION_WINDOW_SECONDS = 30;

/** Windows accepted either side of the current one. */
export const ROTATION_SKEW = 1;

/** The counter a code is computed against. */
export function rotationWindow(at: number = Date.now()): number {
  return Math.floor(at / 1000 / ROTATION_WINDOW_SECONDS);
}

/**
 * The exact bytes hashed for a window.
 *
 * The ticket id is inside it, so a seed leaked from one ticket cannot generate codes for
 * another even if the seeds were somehow identical.
 */
export function rotationInput(ticketId: string, window: number): string {
  return `${ROTATION_VERSION}|${ticketId}|${window}`;
}

/** Base32-ish alphabet without the characters that misread at a door: I, O, 0, 1. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Turns raw HMAC bytes into a short human-checkable code. */
export function encodeRotationCode(bytes: Uint8Array, length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Compute a code in the browser, with Web Crypto.
 *
 * Returns null when Web Crypto is unavailable — an insecure context, or a browser old
 * enough not to have it. The wallet falls back to the static signed code in that case,
 * which still scans; a ticket that renders nothing is a customer at a door with no way
 * in, and that is a worse failure than a slightly weaker code.
 */
export async function computeRotationCodeInBrowser(
  seed: string,
  ticketId: string,
  at: number = Date.now()
): Promise<string | null> {
  if (typeof globalThis.crypto?.subtle === 'undefined') return null;

  try {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(seed),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(rotationInput(ticketId, rotationWindow(at)))
    );
    return encodeRotationCode(new Uint8Array(signature));
  } catch {
    return null;
  }
}

/** Milliseconds until the current code expires — drives the wallet's countdown. */
export function millisUntilRotation(at: number = Date.now()): number {
  const period = ROTATION_WINDOW_SECONDS * 1000;
  return period - (at % period);
}
