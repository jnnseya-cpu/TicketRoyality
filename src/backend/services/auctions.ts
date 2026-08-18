import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';
import {
  closeAfterBid,
  minimumBidMinor,
  refuseBid,
  reserveMet,
  reserveState,
  settleProxy,
  type Lot,
} from '@/shared/auctions';

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
/**
 * The public face of a lot, one document per lot, written in the same transaction as
 * every change to the real one.
 *
 * It exists because of a rules problem with no rules solution: the room should watch the
 * price move live — Firestore's own onSnapshot, no new vendor, no polling — but the lot
 * document carries the high bidder's name, email and secret maximum, and security rules
 * cannot hide fields, only documents. So the lot stays admin-only and this projection
 * carries money and time and nothing else. If a field is ever added here, ask first
 * whether the whole room may see it.
 */
const TICKER = 'auction_ticker';

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
  /**
   * The current leader's maximum, never disclosed. Only the leader's ceiling matters:
   * a proxy below the public price is spent, and a new bid either beats this or raises
   * the price to its own ceiling and dies.
   */
  proxyMaxMinor?: number;
  currency: string;
}

export type BidResult =
  | { ok: true; amountMinor: number; closesAt: string; leading: boolean }
  | {
      ok: false;
      reason: 'closed' | 'too-low' | 'not-a-number' | 'no-lot' | 'unavailable' | 'own-bid';
      error: string;
      /** What it would now take to lead, so the bidder can act rather than guess. */
      minimumMinor?: number;
    };

/** The whole-room projection of a lot. Money and time; never a person, never a ceiling. */
function tickerOf(lotId: string, lot: AuctionLot) {
  return {
    lotId,
    eventId: lot.eventId,
    status: lot.status,
    highBidMinor: lot.highBidMinor ?? 0,
    minimumMinor: minimumBidMinor(lot),
    bidCount: lot.bidCount ?? 0,
    closesAt: lot.closesAt,
    reserve: reserveState(lot),
    updatedAt: new Date().toISOString(),
  };
}

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

    await getAdminDb()
      .collection(TICKER)
      .doc(ref.id)
      .set(tickerOf(ref.id, {
        eventId: input.eventId,
        startMinor: Math.max(0, Math.round(input.startMinor)),
        incrementMinor: Math.max(1, Math.round(input.incrementMinor)),
        ...(input.reserveMinor ? { reserveMinor: Math.round(input.reserveMinor) } : {}),
        closesAt: input.closesAt,
        status: 'open',
        bidCount: 0,
      } as Partial<AuctionLot> as AuctionLot));

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

      const tickerRef = db.collection(TICKER).doc(input.lotId);
      const amountMinor = Math.round(input.amountMinor);

      /*
       * The leader raising their own ceiling.
       *
       * This used to be refused as "you are already the highest bidder", which is right
       * for a plain re-bid and wrong for a proxy: raising your maximum while you lead is
       * the normal defensive move before leaving the room, it moves the public price not
       * one penny, and it costs nothing unless somebody actually challenges. Lowering it
       * is refused — a ceiling that can drop after a challenger was settled against it
       * would rewrite a fight that already happened.
       */
      if (lot.highBidderId && lot.highBidderId === input.userId) {
        const currentMax = lot.proxyMaxMinor ?? lot.highBidMinor ?? 0;
        if (amountMinor <= currentMax) {
          return {
            ok: false,
            reason: 'own-bid',
            error: 'You are already leading — enter more than your current maximum to raise it.',
            minimumMinor: minimumBidMinor(lot),
          };
        }
        tx.update(lotRef, { proxyMaxMinor: amountMinor });
        return { ok: true, amountMinor: lot.highBidMinor ?? 0, closesAt: lot.closesAt, leading: true };
      }

      const refusal = refuseBid(lot, amountMinor, now);
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

      /*
       * Every bid is a maximum (docs/23-era gap list — "no proxy bids" is closed).
       *
       * First bid: leads at the opening ask, ceiling stored, room told the start price.
       * Against an incumbent: the two maximums settle the way an auctioneer settles
       * them — higher ceiling leads at one increment past the lower, tie to the
       * incumbent — all inside this one transaction, so a challenger beaten by a
       * standing maximum is beaten *instantly* and told so, rather than being shown as
       * leading for fifteen seconds and then silently displaced.
       */
      const incumbentMax = lot.proxyMaxMinor ?? lot.highBidMinor ?? 0;
      const hasIncumbent = Boolean(lot.highBidderId) && incumbentMax > 0;

      const settled = hasIncumbent
        ? settleProxy({
            incumbentMaxMinor: incumbentMax,
            challengerMaxMinor: amountMinor,
            incrementMinor: lot.incrementMinor,
          })
        : { winner: 'challenger' as const, priceMinor: lot.startMinor };

      const leading = settled.winner === 'challenger';

      const updatedLot: Partial<AuctionLot> = {
        highBidMinor: settled.priceMinor,
        bidCount: (lot.bidCount ?? 0) + 1,
        closesAt,
      };
      if (leading) {
        updatedLot.highBidderId = input.userId;
        updatedLot.highBidderName = input.name;
        updatedLot.highBidderEmail = input.email;
        updatedLot.proxyMaxMinor = amountMinor;
      }
      tx.update(lotRef, { ...updatedLot, lastBidAt: now.toISOString() });

      tx.set(
        tickerRef,
        tickerOf(input.lotId, { ...lot, ...updatedLot } as AuctionLot)
      );

      /*
       * Every bid is kept, not just the winning one. An auction's audit trail is the
       * answer to "who bid what and when", which somebody always asks afterwards, and a
       * lot that only remembers its high bid cannot answer it. The stored amount is the
       * bidder's maximum: the trail exists for disputes, and a dispute is about what was
       * committed, not what was displayed.
       */
      tx.create(db.collection(BIDS).doc(), {
        lotId: input.lotId,
        eventId: lot.eventId,
        organizerId: lot.organizerId,
        userId: input.userId,
        name: input.name,
        email: input.email,
        amountMinor,
        leading,
        at: now.toISOString(),
      });

      return { ok: true, amountMinor: settled.priceMinor, closesAt, leading };
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

      // The room watches the ticker, so the hammer must fall there too.
      await db
        .collection(TICKER)
        .doc(doc.id)
        .set(tickerOf(doc.id, { ...lot, status: 'closed' }))
        .catch(() => undefined);

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
    await getAdminDb()
      .collection(TICKER)
      .doc(lotId)
      .set({ status: 'paid', updatedAt: new Date().toISOString() }, { merge: true })
      .catch(() => undefined);
    return true;
  } catch (error) {
    reportError(error, { scope: 'auction.paid', lotId });
    return false;
  }
}
