/**
 * Analytics tests. Run with: npm run test:analytics
 *
 * These numbers are read by an organiser deciding how many staff to put on a door, when
 * to start advertising, and whether to add capacity. A wrong figure here is not a
 * rendering bug — it is a decision made on a number nobody can check.
 *
 * The cases that matter most are the ones where a naive implementation looks right:
 * refunded tickets quietly inflating revenue, an empty day silently skipped so a stalled
 * event draws as a steady one, and a rate averaged over days the event did not exist.
 */
import assert from 'node:assert/strict';

import {
  arrivalCurve,
  attendance,
  fanSummary,
  forecastSellOut,
  leadTimes,
  liveTickets,
  salesByDay,
  tierMix,
} from './analytics';
import type { Ticket } from './types';

const results: Array<[string, boolean]> = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([name, false]);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const EVENT_DATE = '2026-09-01T19:00:00.000Z';

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: Math.random().toString(36).slice(2),
    reference: 'TR-0001',
    eventId: 'event-1',
    eventTitle: 'Royal Night Live',
    eventDate: EVENT_DATE,
    eventLocation: 'Wembley',
    organizerId: 'org-1',
    organizerName: 'Groupe Nseya',
    userId: 'cust-1',
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    tierName: 'General',
    price: 25,
    currency: 'GBP',
    status: 'valid',
    purchasedAt: '2026-08-01T10:00:00.000Z',
    paymentProvider: 'stripe',
    ...overrides,
  };
}

console.log('\nAnalytics\n');

/* -------------------------------------------------------------------------- */
/* Refunds                                                                    */
/* -------------------------------------------------------------------------- */

test('a refunded ticket is not a sale', () => {
  // The error that grows exactly when an event is going badly, which is when these
  // numbers are read most carefully.
  const tickets = [ticket(), ticket({ status: 'refunded' }), ticket({ status: 'cancelled' })];
  assert.equal(liveTickets(tickets).length, 1);
  assert.equal(tierMix(tickets)[0].gross, 25);
});

test('a redeemed ticket is still a sale', () => {
  assert.equal(liveTickets([ticket({ status: 'redeemed' })]).length, 1);
});

/* -------------------------------------------------------------------------- */
/* Velocity                                                                   */
/* -------------------------------------------------------------------------- */

test('a day with no sales is drawn as a day with no sales', () => {
  /*
   * The single most misleading thing a sales chart can do: skip the empty days so a
   * fortnight of silence renders as a straight line between two good weeks.
   */
  const tickets = [
    ticket({ purchasedAt: '2026-08-01T10:00:00.000Z' }),
    ticket({ purchasedAt: '2026-08-04T10:00:00.000Z' }),
  ];
  const days = salesByDay(tickets, Date.parse('2026-08-04T23:00:00.000Z'));
  assert.equal(days.length, 4, 'the two dead days must be present');
  assert.deepEqual(
    days.map((d) => d.count),
    [1, 0, 0, 1]
  );
});

test('the running total only ever goes up', () => {
  const tickets = [
    ticket({ purchasedAt: '2026-08-01T10:00:00.000Z' }),
    ticket({ purchasedAt: '2026-08-02T10:00:00.000Z' }),
    ticket({ purchasedAt: '2026-08-02T11:00:00.000Z' }),
  ];
  const days = salesByDay(tickets, Date.parse('2026-08-02T23:00:00.000Z'));
  assert.deepEqual(
    days.map((d) => d.cumulative),
    [1, 3]
  );
});

test('no sales at all is an empty chart, not a crash', () => {
  assert.deepEqual(salesByDay([]), []);
});

/* -------------------------------------------------------------------------- */
/* Forecast                                                                   */
/* -------------------------------------------------------------------------- */

const NOW = Date.parse('2026-08-15T12:00:00.000Z');

test('a steady rate projects a sell-out date', () => {
  // Ten a day for ten days, ninety left: nine more days.
  const tickets = Array.from({ length: 100 }, (_, i) =>
    ticket({ purchasedAt: new Date(NOW - (i % 10) * 86_400_000).toISOString() })
  );
  const forecast = forecastSellOut(tickets, 190, EVENT_DATE, NOW);
  assert.ok(forecast.projectedDate, 'a rate this steady must produce a date');
  assert.ok(forecast.dailyRate > 0);
});

test('a young event is not averaged over days it did not exist', () => {
  /*
   * Twenty sales yesterday on a two-day-old event is twenty a day, not one and a half —
   * which is what dividing by a fourteen-day window would say, and it would tell the
   * organiser to panic about a show that is selling fast.
   */
  const tickets = Array.from({ length: 20 }, () =>
    ticket({ purchasedAt: new Date(NOW - 86_400_000).toISOString() })
  );
  const forecast = forecastSellOut(tickets, 100, EVENT_DATE, NOW);
  assert.ok(forecast.dailyRate >= 10, `expected a young-event rate, got ${forecast.dailyRate}`);
  assert.ok(forecast.windowDays <= 2);
});

test('a sold-out event says sold out rather than projecting a date', () => {
  const tickets = Array.from({ length: 50 }, () => ticket());
  const forecast = forecastSellOut(tickets, 50, EVENT_DATE, NOW);
  assert.equal(forecast.projectedDate, null);
  assert.equal(forecast.reason, 'sold-out');
});

test('an event with no recent sales says so rather than projecting from nothing', () => {
  const tickets = [ticket({ purchasedAt: '2026-01-01T10:00:00.000Z' })];
  const forecast = forecastSellOut(tickets, 100, EVENT_DATE, NOW);
  assert.equal(forecast.projectedDate, null);
  assert.equal(forecast.reason, 'no-sales');
});

test('a projection past the event is reported as such, not as a date', () => {
  // "Sells out three weeks after the doors close" is arithmetic, not information.
  const tickets = [ticket({ purchasedAt: new Date(NOW - 86_400_000).toISOString() })];
  const forecast = forecastSellOut(tickets, 10_000, EVENT_DATE, NOW);
  assert.equal(forecast.projectedDate, null);
  assert.equal(forecast.reason, 'after-event');
});

/* -------------------------------------------------------------------------- */
/* Door                                                                       */
/* -------------------------------------------------------------------------- */

test('arrivals bucket around the advertised start', () => {
  const tickets = [
    ticket({ status: 'redeemed', redeemedAt: '2026-09-01T18:20:00.000Z' }),
    ticket({ status: 'redeemed', redeemedAt: '2026-09-01T18:25:00.000Z' }),
    ticket({ status: 'redeemed', redeemedAt: '2026-09-01T19:10:00.000Z' }),
  ];
  const curve = arrivalCurve(tickets, EVENT_DATE);
  assert.equal(curve.length, 2);
  assert.equal(curve[0].count, 2, 'both pre-door arrivals share a bucket');
  assert.equal(curve[0].offsetMinutes, -45);
  assert.equal(curve[1].offsetMinutes, 0);
});

test('an unscanned event has no arrival curve rather than a flat one', () => {
  assert.deepEqual(arrivalCurve([ticket()], EVENT_DATE), []);
});

test('the no-show rate is null with nothing sold, never a shocking zero', () => {
  assert.equal(attendance([]).rate, null);
  const mixed = [ticket({ status: 'redeemed' }), ticket()];
  assert.equal(attendance(mixed).rate, 0.5);
  assert.equal(attendance(mixed).noShows, 1);
});

/* -------------------------------------------------------------------------- */
/* Audience                                                                   */
/* -------------------------------------------------------------------------- */

test('lead times land in the band the purchase actually falls in', () => {
  const bands = leadTimes(
    [
      ticket({ purchasedAt: '2026-09-01T09:00:00.000Z' }), // same day
      ticket({ purchasedAt: '2026-08-28T09:00:00.000Z' }), // 4 days
      ticket({ purchasedAt: '2026-08-10T09:00:00.000Z' }), // 3 weeks
      ticket({ purchasedAt: '2026-07-01T09:00:00.000Z' }), // 2 months
      ticket({ purchasedAt: '2026-01-01T09:00:00.000Z' }), // 8 months
    ],
    EVENT_DATE
  );
  assert.deepEqual(
    bands.map((b) => b.count),
    [1, 1, 1, 1, 1]
  );
});

test('four tickets to one show is one buyer, not a returning fan', () => {
  /*
   * Counting by tickets would make a group of friends look like loyalty, and an
   * organiser would build a rewards programme on a number that is mostly party size.
   */
  const tickets = Array.from({ length: 4 }, () => ticket({ eventId: 'event-1' }));
  const fans = fanSummary(tickets);
  assert.equal(fans.uniqueBuyers, 1);
  assert.equal(fans.repeatBuyers, 0);
  assert.equal(fans.topFans[0].events, 1);
});

test('the same person at two events is a repeat buyer', () => {
  const fans = fanSummary([ticket({ eventId: 'event-1' }), ticket({ eventId: 'event-2' })]);
  assert.equal(fans.repeatBuyers, 1);
  assert.equal(fans.repeatRate, 1);
});

test('email case never splits one fan into two', () => {
  const fans = fanSummary([
    ticket({ eventId: 'event-1', attendeeEmail: 'Ada@Example.com' }),
    ticket({ eventId: 'event-2', attendeeEmail: 'ada@example.com' }),
  ]);
  assert.equal(fans.uniqueBuyers, 1);
  assert.equal(fans.repeatBuyers, 1);
});

test('tier mix ranks by money, which is not the same order as by count', () => {
  const tickets = [
    ticket({ tierName: 'General', price: 25 }),
    ticket({ tierName: 'General', price: 25 }),
    ticket({ tierName: 'VIP', price: 200 }),
  ];
  const mix = tierMix(tickets);
  assert.equal(mix[0].tierName, 'VIP');
  assert.equal(mix[0].gross, 200);
  assert.equal(mix[1].count, 2);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
