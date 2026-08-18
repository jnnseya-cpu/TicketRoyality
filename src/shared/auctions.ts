/**
 * Auction lots — the rules, with no database in sight.
 *
 * A charity auction is the one part of a fundraising evening where software regularly
 * embarrasses the organiser: two people are told they are winning, a lot closes while
 * somebody's bid is in flight, or the room bids £500 in the last ten seconds and the
 * clock cuts them off. All three are decidable rules, so they live here and are tested
 * without a network.
 *
 * ## Not a gift
 *
 * A winning bid buys goods. **No Gift Aid is claimed on it** — not on the whole bid, not
 * on the excess over the lot's value. That is why an auction payment never touches the
 * donation path, however much of it the charity keeps.
 */

export interface Lot {
  startMinor: number;
  incrementMinor: number;
  /** Below this the lot does not sell, however high the bidding goes. */
  reserveMinor?: number;
  closesAt: string;
  highBidMinor?: number;
  /**
   * Minutes a late bid pushes the close back by. Zero disables it.
   *
   * The room bidding in the last ten seconds is the whole point of an auction, and a hard
   * cutoff rewards whoever has the fastest connection rather than whoever will pay most.
   */
  extendMinutes?: number;
}

/** The least a new bid may be. */
export function minimumBidMinor(lot: Lot): number {
  return lot.highBidMinor === undefined || lot.highBidMinor <= 0
    ? lot.startMinor
    : lot.highBidMinor + lot.incrementMinor;
}

export type BidRefusal = 'closed' | 'too-low' | 'not-a-number';

/**
 * Whether a bid stands, judged against a lot as it is *right now*.
 *
 * `now` is passed rather than read, because this same function runs inside a Firestore
 * transaction where the clock must be the one the caller committed to, and in a browser
 * where it is only a courtesy.
 */
export function refuseBid(lot: Lot, amountMinor: number, now: Date): BidRefusal | null {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 'not-a-number';
  if (new Date(lot.closesAt).getTime() <= now.getTime()) return 'closed';
  if (amountMinor < minimumBidMinor(lot)) return 'too-low';
  return null;
}

/**
 * When the lot closes after this bid.
 *
 * A bid inside the extension window pushes the close out, so the lot ends when the
 * bidding ends rather than when the clock happens to run out. Bids earlier than that
 * leave the time alone — extending on every bid would make a lot with steady interest
 * run all night.
 */
export function closeAfterBid(lot: Lot, now: Date): string {
  const extend = lot.extendMinutes ?? 0;
  if (extend <= 0) return lot.closesAt;

  const closes = new Date(lot.closesAt).getTime();
  const windowOpens = closes - extend * 60_000;

  if (now.getTime() < windowOpens) return lot.closesAt;
  return new Date(now.getTime() + extend * 60_000).toISOString();
}

/** Did the bidding reach the reserve? A lot that did not simply does not sell. */
export function reserveMet(lot: Lot): boolean {
  if (!lot.reserveMinor) return true;
  return (lot.highBidMinor ?? 0) >= lot.reserveMinor;
}

/**
 * What a bidder is shown about the reserve.
 *
 * Auction convention, and it matters: the *amount* of a reserve is not disclosed — that
 * is the point of having one — but whether it has been met is, because a room bidding
 * towards a wall they cannot see stops bidding.
 */
export function reserveState(lot: Lot): 'none' | 'met' | 'not-met' {
  if (!lot.reserveMinor) return 'none';
  return reserveMet(lot) ? 'met' : 'not-met';
}

/**
 * Proxy settlement — two maximums meet, one price comes out (docs/23-era gap list;
 * the charity card's "no proxy bids" line).
 *
 * Every bid is a maximum: the bidder names the most they will pay, and the room only
 * ever sees the least that currently wins. When a challenger arrives, the two maximums
 * are settled the way an auctioneer would settle them — the higher one leads at one
 * increment past the lower, capped at its own ceiling — and a tie goes to the incumbent,
 * because the earlier commitment at the same money was first.
 *
 * Pure and side-effect free: the service runs it inside the bid transaction, and the
 * tests run it on a table of cases. The maximums themselves are never disclosed —
 * an auction is public about the price and silent about the ceiling.
 */
export function settleProxy(params: {
  incumbentMaxMinor: number;
  challengerMaxMinor: number;
  incrementMinor: number;
}): { winner: 'incumbent' | 'challenger'; priceMinor: number } {
  const { incumbentMaxMinor, challengerMaxMinor, incrementMinor } = params;

  if (challengerMaxMinor > incumbentMaxMinor) {
    return {
      winner: 'challenger',
      // One increment past the beaten maximum — never the challenger's own ceiling,
      // unless the two are so close that the increment would overshoot it.
      priceMinor: Math.min(challengerMaxMinor, incumbentMaxMinor + incrementMinor),
    };
  }

  return {
    winner: 'incumbent',
    priceMinor: Math.min(incumbentMaxMinor, challengerMaxMinor + incrementMinor),
  };
}
