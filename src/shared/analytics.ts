import type { Ticket } from '@/shared/types';

/**
 * Event analytics.
 *
 * ## Pure, and shared on purpose
 *
 * Every number here is computed from tickets the organiser can already see. Nothing is
 * sampled, modelled or estimated except where a function says `forecast` in its name,
 * and those say what they assume. A dashboard that shows a confident number nobody can
 * derive is worse than one that shows nothing: the organiser makes a staffing or a
 * pricing decision on it, and there is no way to find out it was wrong.
 *
 * ## Refunded tickets are excluded from sales, counted in churn
 *
 * A refunded ticket is not a sale. Leaving it in inflates every revenue figure and every
 * velocity curve, and the error grows exactly when an event is going badly — which is
 * when the numbers are being read most carefully.
 */

/** Sold and still standing. The basis for every revenue and velocity figure. */
export function liveTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === 'valid' || t.status === 'redeemed');
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export interface DayPoint {
  date: string;
  count: number;
  gross: number;
  cumulative: number;
}

/**
 * Sales per day, with the running total.
 *
 * Days with no sales are filled in. A chart that silently skips them draws a straight
 * line across a dead fortnight and makes a stalled event look like a steady one — which
 * is the single most misleading thing a sales graph can do.
 */
export function salesByDay(tickets: Ticket[], now = Date.now()): DayPoint[] {
  const live = liveTickets(tickets);
  if (live.length === 0) return [];

  const byDay = new Map<string, { count: number; gross: number }>();
  for (const ticket of live) {
    const key = dayKey(ticket.purchasedAt);
    const entry = byDay.get(key) ?? { count: 0, gross: 0 };
    entry.count += 1;
    entry.gross += ticket.price;
    byDay.set(key, entry);
  }

  const first = [...byDay.keys()].sort()[0];
  const points: DayPoint[] = [];
  let cumulative = 0;

  for (let day = new Date(`${first}T00:00:00.000Z`).getTime(); day <= now; day += 86_400_000) {
    const key = new Date(day).toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { count: 0, gross: 0 };
    cumulative += entry.count;
    points.push({ date: key, count: entry.count, gross: entry.gross, cumulative });
  }

  return points;
}

export interface SellOutForecast {
  /** Tickets a day over the window used. */
  dailyRate: number;
  remaining: number;
  /** ISO date, or null when the rate cannot support a projection. */
  projectedDate: string | null;
  /** Why there is no date, so the UI can say something true instead of nothing. */
  reason?: 'sold-out' | 'no-sales' | 'after-event';
  /** Days of data the rate came from. Fewer than three is thin, and the UI says so. */
  windowDays: number;
}

/**
 * When this sells out, if nothing changes.
 *
 * Deliberately naive: a straight line from the last two weeks. Not because a better model
 * is impossible, but because an organiser can check this one in their head against their
 * own sales, and a forecast nobody can check is a forecast nobody should act on.
 *
 * The honest caveats are returned rather than buried: how many days it looked at, and why
 * there is no date when there isn't one. A projection past the event itself is reported
 * as `after-event` rather than as a date, because "sells out three weeks after the doors
 * close" is not information, it is arithmetic nobody asked for.
 */
export function forecastSellOut(
  tickets: Ticket[],
  capacity: number,
  eventDate: string,
  now = Date.now(),
  windowDays = 14
): SellOutForecast {
  const live = liveTickets(tickets);
  const remaining = Math.max(0, capacity - live.length);

  if (remaining === 0) {
    return { dailyRate: 0, remaining: 0, projectedDate: null, reason: 'sold-out', windowDays: 0 };
  }

  const since = now - windowDays * 86_400_000;
  const recent = live.filter((t) => new Date(t.purchasedAt).getTime() >= since);

  // The window is only as long as the event has been on sale — a two-day-old event has a
  // two-day rate, not a fortnightly one averaged over twelve days of not existing.
  const firstSale = live.length > 0
    ? Math.min(...live.map((t) => new Date(t.purchasedAt).getTime()))
    : now;
  const observed = Math.max(1, Math.min(windowDays, Math.ceil((now - firstSale) / 86_400_000)));

  if (recent.length === 0) {
    return { dailyRate: 0, remaining, projectedDate: null, reason: 'no-sales', windowDays: observed };
  }

  const dailyRate = recent.length / observed;
  const daysToGo = remaining / dailyRate;
  const projected = now + daysToGo * 86_400_000;

  if (projected > new Date(eventDate).getTime()) {
    return {
      dailyRate,
      remaining,
      projectedDate: null,
      reason: 'after-event',
      windowDays: observed,
    };
  }

  return {
    dailyRate,
    remaining,
    projectedDate: new Date(projected).toISOString().slice(0, 10),
    windowDays: observed,
  };
}

export interface ArrivalBucket {
  /** Minutes relative to the advertised start. Negative is before. */
  offsetMinutes: number;
  label: string;
  count: number;
}

/**
 * When people actually arrived, in fifteen-minute buckets around the advertised start.
 *
 * This is the number that decides how many staff stand on a door, and it is the one thing
 * a ticketing platform knows that a venue cannot easily find out for itself. It is
 * measured from real redemptions — nothing here is a model.
 */
export function arrivalCurve(tickets: Ticket[], eventDate: string, bucketMinutes = 15): ArrivalBucket[] {
  const start = new Date(eventDate).getTime();
  const redeemed = tickets.filter((t) => t.status === 'redeemed' && t.redeemedAt);
  if (redeemed.length === 0) return [];

  const buckets = new Map<number, number>();
  for (const ticket of redeemed) {
    const offset = (new Date(ticket.redeemedAt!).getTime() - start) / 60_000;
    const bucket = Math.floor(offset / bucketMinutes) * bucketMinutes;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offsetMinutes, count]) => ({
      offsetMinutes,
      label:
        offsetMinutes === 0
          ? 'Doors'
          : offsetMinutes < 0
            ? `${Math.abs(offsetMinutes)}m before`
            : `${offsetMinutes}m after`,
      count,
    }));
}

export interface PredictedBucket {
  offsetMinutes: number;
  label: string;
  /** Share of the crowd expected in this bucket, 0–100. */
  sharePct: number;
}

/**
 * The arrival curve an organiser should staff their NEXT event for, learned from the
 * door scans of their past ones.
 *
 * Cross-event, which is what `arrivalCurve` above deliberately is not: each past event
 * is normalised to *shares* before averaging, so a 2,000-scan festival and a 60-scan
 * club night teach the curve equally — the question is "when does this organiser's
 * crowd arrive", not "which of their events was biggest". Events with fewer than
 * `minScans` redemptions are excluded: three people cannot describe a curve, and
 * including them would let one early-arriving family bend the staffing plan.
 *
 * Still not a model — it is an average of measured behaviour, and `eventsUsed` is
 * returned so the page can say exactly how much history the prediction stands on.
 */
export function predictedArrival(
  pastEvents: Array<{ eventDate: string; tickets: Ticket[] }>,
  bucketMinutes = 15,
  minScans = 5
): { curve: PredictedBucket[]; eventsUsed: number } {
  const shares = new Map<number, number[]>();
  let eventsUsed = 0;

  for (const past of pastEvents) {
    const start = new Date(past.eventDate).getTime();
    const redeemed = past.tickets.filter((t) => t.status === 'redeemed' && t.redeemedAt);
    if (redeemed.length < minScans || Number.isNaN(start)) continue;
    eventsUsed += 1;

    const counts = new Map<number, number>();
    for (const ticket of redeemed) {
      const offset = (new Date(ticket.redeemedAt!).getTime() - start) / 60_000;
      const bucket = Math.floor(offset / bucketMinutes) * bucketMinutes;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    for (const [bucket, count] of counts) {
      const list = shares.get(bucket) ?? [];
      list.push((count / redeemed.length) * 100);
      shares.set(bucket, list);
    }
  }

  if (eventsUsed === 0) return { curve: [], eventsUsed: 0 };

  const curve = [...shares.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offsetMinutes, list]) => ({
      offsetMinutes,
      label:
        offsetMinutes === 0
          ? 'Doors'
          : offsetMinutes < 0
            ? `${Math.abs(offsetMinutes)}m before`
            : `${offsetMinutes}m after`,
      // Averaged over the events that USED the bucket contributing their share and the
      // rest contributing zero — an event nobody scanned at 90m-after must pull that
      // bucket down, or one late-running event dominates the tail.
      sharePct: Math.round((list.reduce((sum, v) => sum + v, 0) / eventsUsed) * 10) / 10,
    }));

  return { curve, eventsUsed };
}

export interface Attendance {
  sold: number;
  admitted: number;
  /** 0–1. `null` when nothing was sold, rather than a misleading zero. */
  rate: number | null;
  noShows: number;
}

/**
 * Who turned up.
 *
 * The no-show rate is what makes a second event's capacity decision a real one. Reported
 * as `null` rather than `0` when nothing sold, because a 0% attendance rate on an event
 * with no tickets reads as a disaster rather than as an absence of data.
 */
export function attendance(tickets: Ticket[]): Attendance {
  const live = liveTickets(tickets);
  const admitted = live.filter((t) => t.status === 'redeemed').length;
  return {
    sold: live.length,
    admitted,
    rate: live.length === 0 ? null : admitted / live.length,
    noShows: live.length - admitted,
  };
}

export interface TierSlice {
  tierName: string;
  count: number;
  gross: number;
}

/** What people actually bought, by tier. Revenue as well as count — they rank differently. */
export function tierMix(tickets: Ticket[]): TierSlice[] {
  const mix = new Map<string, TierSlice>();
  for (const ticket of liveTickets(tickets)) {
    const name = ticket.tierName || 'Unnamed';
    const slice = mix.get(name) ?? { tierName: name, count: 0, gross: 0 };
    slice.count += 1;
    slice.gross += ticket.price;
    mix.set(name, slice);
  }
  return [...mix.values()].sort((a, b) => b.gross - a.gross);
}

export interface LeadTimeBand {
  band: string;
  count: number;
}

/**
 * How far ahead people buy.
 *
 * The bands are coarse on purpose. An organiser deciding when to start advertising needs
 * to know whether their audience books months ahead or on the day; a histogram of exact
 * hours tells them nothing they can act on.
 */
export function leadTimes(tickets: Ticket[], eventDate: string): LeadTimeBand[] {
  const start = new Date(eventDate).getTime();
  const bands: Array<{ band: string; maxDays: number }> = [
    { band: 'Same day', maxDays: 1 },
    { band: '1–7 days', maxDays: 7 },
    { band: '1–4 weeks', maxDays: 28 },
    { band: '1–3 months', maxDays: 90 },
    { band: '3 months+', maxDays: Number.POSITIVE_INFINITY },
  ];

  const counts = bands.map((b) => ({ band: b.band, count: 0 }));
  for (const ticket of liveTickets(tickets)) {
    const days = (start - new Date(ticket.purchasedAt).getTime()) / 86_400_000;
    const index = bands.findIndex((b) => days < b.maxDays);
    counts[index < 0 ? bands.length - 1 : index].count += 1;
  }
  return counts;
}

export interface FanSummary {
  uniqueBuyers: number;
  repeatBuyers: number;
  /** 0–1, or null with no buyers. */
  repeatRate: number | null;
  topFans: Array<{ email: string; name: string; events: number; spend: number }>;
}

/**
 * Repeat buyers, across everything this organiser runs.
 *
 * Counted by **distinct events attended**, not by tickets bought: somebody who buys four
 * tickets to one show is a group of friends, not a returning fan, and treating them as
 * one would make a single large order look like loyalty.
 */
export function fanSummary(tickets: Ticket[], limit = 10): FanSummary {
  const byBuyer = new Map<string, { name: string; events: Set<string>; spend: number }>();

  for (const ticket of liveTickets(tickets)) {
    const email = (ticket.attendeeEmail || '').toLowerCase();
    if (!email) continue;
    const entry = byBuyer.get(email) ?? { name: ticket.attendeeName || email, events: new Set(), spend: 0 };
    entry.events.add(ticket.eventId);
    entry.spend += ticket.price;
    byBuyer.set(email, entry);
  }

  const buyers = [...byBuyer.entries()];
  const repeat = buyers.filter(([, b]) => b.events.size > 1).length;

  return {
    uniqueBuyers: buyers.length,
    repeatBuyers: repeat,
    repeatRate: buyers.length === 0 ? null : repeat / buyers.length,
    topFans: buyers
      .map(([email, b]) => ({ email, name: b.name, events: b.events.size, spend: b.spend }))
      .sort((a, b) => b.events - a.events || b.spend - a.spend)
      .slice(0, limit),
  };
}
