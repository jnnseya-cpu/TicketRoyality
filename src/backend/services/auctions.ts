import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import { closeAfterBid, minimumBidMinor, refuseBid, reserveMet, type Lot } from '@/shared/auctions';

/**
 * Auction lots.
 *
 * ## The bid is a transaction, and it has to be
 *
 * "Read the high bid, add the increment, write it" is the classic lost-update bug, and in
 * an auction it does not merely lose data — it tells two people in the same room that they
 * are winning, which is the moment an organiser stops trusting the software in front of
 * their guests. So a bid reads the lot and writes it in one transaction, and the loser of
 * a tie is told the real current price rather than a failure.
 *
 * ## The clock is the server's
 *
 * A lot closes when the server says it does. A browser's clock is wrong often enough that
 * accepting its opinion would let a bid land after the hammer, and a phone that is a minute
 * fast would refuse a bid the room can see is in time.
 */

const LOTS = 'auction_lots';
const BIDS = 'auction_bids';

export interface AuctionLot extends Lot {
  id: string;
  eventId: string;
  organizerId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  status: 'open' | 'closed' | 'paid';
  bidCount: number;
  highBidderId?: string;
  highBidderName?: string;
  highBidderEmail?: string;
  currency: string;
}

export type BidResult =
  | { ok: true; amountMinor: number; closesAt: string; leading: true }
  | {
      ok: false;
      reason: 'closed' | 'too-low' | 'not-a-number' | 'no-lot' | 'unavailable' | 'own-bid';
      error: string;
      /** What it would now take to lead, so the bidder can act rather than guess. */
      minimumMinor?: number;
    };

export async function createLot(input: {
  eventId: string;
  organizerId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  startMinor: number;
  incrementMinor: number;
  reserveMinor?: number;
  closesAt: string;
  extendMinutes?: number;
  currency?: string;
}): Promise<string | null> {
  if (!isAdminConfigured()) return null;

  try {
    const ref = await getAdminDb()
      .collection(LOTS)
      .add({
        eventId: input.eventId,
        organizerId: input.organizerId,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        startMinor: Math.max(0, Math.round(input.startMinor)),
        // A zero increment would let a bid tie the current high and "lead" it, so the
        // floor is a penny rather than whatever was typed.
        incrementMinor: Math.max(1, Math.round(input.incrementMinor)),
        ...(input.reserveMinor ? { reserveMinor: Math.round(input.reserveMinor) } : {}),
        closesAt: input.closesAt,
        extendMinutes: Math.max(0, Math.round(input.extendMinutes ?? 2)),
        currency: input.currency ?? 'GBP',
        status: 'open',
        bidCount: 0,
        createdAt: new Date().toISOString(),
      });

    return ref.id;
  } catch (error) {
    reportError(error, { scope: 'auction.create', eventId: input.eventId });
    return null;
  }
}

export async function lotsFor(eventId: string): Promise<AuctionLot[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snap = await getAdminDb().collection(LOTS).where('eventId', '==', eventId).limit(500).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as AuctionLot)
      .sort((a, b) => a.closesAt.localeCompare(b.closesAt) || a.title.localeCompare(b.title));
  } catch (error) {
    reportError(error, { scope: 'auction.list', eventId });
    return [];
  }
}

/**
 * Place a bid.
 *
 * The whole decision happens inside one transaction against the stored lot: the browser's
 * idea of the current price is a display, and by the time a bid arrives it is frequently
 * out of date — which is normal in an auction and must produce "the price is now £120",
 * not an error.
 */
export async function placeBid(input: {
  lotId: string;
  amountMinor: number;
  userId: string;
  name: string;
  email: string;
}): Promise<BidResult> {
  if (!isAdminConfigured()) {
    return { ok: false, reason: 'unavailable', error: 'Bidding is unavailable.' };
  }

  const db = getAdminDb();
  const lotRef = db.collection(LOTS).doc(input.lotId);

  try {
    return await db.runTransaction<BidResult>(async (tx) => {
      const snap = await tx.get(lotRef);
      if (!snap.exists) return { ok: false, reason: 'no-lot', error: 'That lot no longer exists.' };

      const lot = snap.data() as AuctionLot;
      const now = new Date();

      if (lot.status !== 'open') {
        return { ok: false, reason: 'closed', error: 'Bidding on this lot has closed.' };
      }

      /*
       * Outbidding yourself only raises the price you will pay. Nobody means to do it,
       * and an auction that allows it looks like it is milking the room.
       */
      if (lot.highBidderId && lot.highBidderId === input.userId) {
        return {
          ok: false,
          reason: 'own-bid',
          error: 'You are already the highest bidder.',
          minimumMinor: minimumBidMinor(lot),
        };
      }

      const refusal = refuseBid(lot, input.amountMinor, now);
      if (refusal) {
        return {
          ok: false,
          reason: refusal,
          error:
            refusal === 'closed'
              ? 'Bidding on this lot has closed.'
              : refusal === 'too-low'
                ? `The price has moved — bids now start at ${(minimumBidMinor(lot) / 100).toFixed(2)}.`
                : 'Enter an amount.',
          minimumMinor: minimumBidMinor(lot),
        };
      }

      // A late bid pushes the close out, so the lot ends when the bidding ends rather
      // than when the clock happens to run out.
      const closesAt = closeAfterBid(lot, now);

      tx.update(lotRef, {
        highBidMinor: Math.round(input.amountMinor),
        highBidderId: input.userId,
        highBidderName: input.name,
        highBidderEmail: input.email,
        bidCount: (lot.bidCount ?? 0) + 1,
        closesAt,
        lastBidAt: now.toISOString(),
      });

      /*
       * Every bid is kept, not just the winning one. An auction's audit trail is the
       * answer to "who bid what and when", which somebody always asks afterwards, and a
       * lot that only remembers its high bid cannot answer it.
       */
      tx.create(db.collection(BIDS).doc(), {
        lotId: input.lotId,
        eventId: lot.eventId,
        organizerId: lot.organizerId,
        userId: input.userId,
        name: input.name,
        email: input.email,
        amountMinor: Math.round(input.amountMinor),
        at: now.toISOString(),
      });

      return { ok: true, amountMinor: Math.round(input.amountMinor), closesAt, leading: true };
    });
  } catch (error) {
    reportError(error, { scope: 'auction.bid', lotId: input.lotId });
    return { ok: false, reason: 'unavailable', error: 'That bid could not be placed.' };
  }
}

export interface LotOutcome {
  lotId: string;
  title: string;
  sold: boolean;
  amountMinor: number;
  winnerName?: string;
  winnerEmail?: string;
}

/**
 * Close the lots whose time is up, and say who won.
 *
 * Run from the cron. A lot is closed by the clock rather than by somebody remembering to
 * press a button, because the one evening nobody presses it is the evening the auction
 * runs until morning.
 *
 * A lot that never reached its reserve closes **unsold**. The reserve is the organiser's
 * floor, and quietly selling below it would be selling something they said they would not.
 */
export async function closeDueLots(): Promise<LotOutcome[]> {
  if (!isAdminConfigured()) return [];

  const db = getAdminDb();
  const outcomes: LotOutcome[] = [];

  try {
    const due = await db
      .collection(LOTS)
      .where('status', '==', 'open')
      .where('closesAt', '<=', new Date().toISOString())
      .limit(200)
      .get();

    for (const doc of due.docs) {
      const lot = doc.data() as AuctionLot;
      const sold = (lot.highBidMinor ?? 0) > 0 && reserveMet(lot);

      await doc.ref.update({
        status: 'closed',
        soldAt: new Date().toISOString(),
        sold,
      });

      outcomes.push({
        lotId: doc.id,
        title: lot.title,
        sold,
        amountMinor: sold ? (lot.highBidMinor ?? 0) : 0,
        ...(sold ? { winnerName: lot.highBidderName, winnerEmail: lot.highBidderEmail } : {}),
      });
    }
  } catch (error) {
    reportError(error, { scope: 'auction.close' });
  }

  return outcomes;
}

/**
 * Mark a won lot paid.
 *
 * Called from the Stripe webhook, keyed on the payment so a redelivery marks it once. A
 * winning bid buys goods, so this never touches the donation path however much of the
 * money the charity keeps — Gift Aid on an auction lot is not claimable.
 */
export async function markLotPaid(lotId: string, providerRef?: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    await getAdminDb()
      .collection(LOTS)
      .doc(lotId)
      .update({
        status: 'paid',
        paidAt: new Date().toISOString(),
        ...(providerRef ? { providerRef } : {}),
      });
    return true;
  } catch (error) {
    reportError(error, { scope: 'auction.paid', lotId });
    return false;
  }
}
