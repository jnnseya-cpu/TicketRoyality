/**
 * The basket, carried through Stripe metadata to the webhook that issues it.
 *
 * Found the hard way: the cart path priced its lines, charged the card — and sent
 * metadata with no items in it, so the webhook had nothing to issue against and a paid
 * basket produced no tickets. The single-event path never had this hole because its
 * metadata carries eventId/tierId; a basket needs the same, per item.
 *
 * Stripe caps a metadata value at 500 characters, so the encoding is deliberately
 * dense — positional arrays, not objects — and `encodeCart` refuses a basket it cannot
 * fit rather than truncating one: a silently dropped line is a paid-for ticket that
 * never exists, the exact failure this module removes.
 */

export interface CartItemMeta {
  eventId: string;
  tierId: string;
  quantity: number;
  /** Unit face price actually charged (post-coupon), major units. */
  unitMajor: number;
}

const LIMIT = 480;

export function encodeCart(items: CartItemMeta[]): { ok: true; value: string } | { ok: false } {
  const value = JSON.stringify(
    items.map((item) => [item.eventId, item.tierId, item.quantity, item.unitMajor])
  );
  return value.length <= LIMIT ? { ok: true, value } : { ok: false };
}

export function decodeCart(value: string | undefined): CartItemMeta[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<[string, string, number, number]>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string')
      .map((row) => ({
        eventId: row[0],
        tierId: row[1],
        quantity: Math.max(1, Number(row[2]) || 1),
        unitMajor: Math.max(0, Number(row[3]) || 0),
      }));
  } catch {
    return [];
  }
}
