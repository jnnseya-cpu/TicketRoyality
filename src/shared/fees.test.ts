/**
 * Pricing engine tests. Run with: npm run test:fees
 *
 * Three groups, matching §34 of the brief.
 *
 *   PRICE INTEGRITY  — the number shown is the number charged, and the organiser keeps
 *                      100% of face value on every path.
 *   PROFITABILITY    — every fee-bearing basket clears the 2× cost multiple.
 *   COMPLIANCE       — no bare face value can be presented as a price, and the fee does
 *                      not move with the payment method.
 *
 * The worked examples from §22 are fixtures rather than illustrations. If a future
 * config change moves £50 off £2.49, that is a commercial decision someone has to make
 * on purpose, and this file is where it stops being accidental.
 */
import assert from 'node:assert/strict';

import {
  allInTicketPriceMinor,
  computeOrderFees,
  serviceFeeForTicket,
  toMinor,
  validateFeeConfig,
} from './fees';
import { ZERO_FEE_CONFIG, type PaymentRail } from './constants/fees';

const results: Array<[string, boolean]> = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([name, false]);
    console.error(`  ✗ ${name}\n      ${(error as Error).message.split('\n')[0]}`);
  }
}

console.log('\nPricing engine — price integrity\n');

/**
 * §22's worked examples, with the one agreed departure.
 *
 * £5 → £0.79 rather than the published £0.69: 69p cannot reach the 2× cost multiple on
 * any rail, and 79p is the lowest floor that does. Every other figure is the brief's
 * exactly. The floor binds below about £7.50 and changes nothing above it.
 */
const WORKED: Array<[number, number]> = [
  [500, 79],
  [1000, 89],
  [2500, 149],
  [5000, 249],
  [10000, 448],
];

for (const [face, fee] of WORKED) {
  test(`£${face / 100} ticket carries a £${(fee / 100).toFixed(2)} service fee`, () => {
    assert.equal(serviceFeeForTicket(face), fee);
  });
}

test('the fan total is face plus fee, to the penny', () => {
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 2 }]);
  assert.equal(quote.faceMinor, 10000);
  assert.equal(quote.serviceFeeMinor, 498); // 2 × £2.49
  assert.equal(quote.buyerTotalMinor, 10498); // §14's worked checkout
});

test('the card price and the checkout price are the same number', () => {
  // The compliance failure is a difference between these two, so they are asserted
  // against each other rather than against a constant.
  const card = allInTicketPriceMinor(5000);
  const checkout = computeOrderFees([{ faceMinor: 5000, qty: 1 }]).buyerTotalMinor;
  assert.equal(card, checkout);
});

test('the organiser is paid the whole face value', () => {
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 2 }]);
  assert.equal(quote.organiserPayoutMinor, 10000);
  assert.equal(quote.organiserPayoutMinor, quote.faceMinor);
});

test('organiser commission is zero at every price point', () => {
  for (const [face] of WORKED) {
    const quote = computeOrderFees([{ faceMinor: face, qty: 3 }]);
    assert.equal(quote.organiserPayoutMinor, face * 3, `£${face / 100} lost money`);
  }
  assert.equal(ZERO_FEE_CONFIG.countries.GB.organiserCommissionPct, 0);
  assert.equal(ZERO_FEE_CONFIG.countries.GB.organiserFixedFeeMinor, 0);
});

test('a free ticket carries no fee', () => {
  assert.equal(serviceFeeForTicket(0), 0);
});

test('300 free places cost nobody anything', () => {
  // The old admin fee charged 50p a head here — £150 to give tickets away, aimed
  // squarely at weddings, charities and places of worship.
  const quote = computeOrderFees([{ faceMinor: 0, qty: 300 }]);
  assert.equal(quote.serviceFeeMinor, 0);
  assert.equal(quote.buyerTotalMinor, 0);
  assert.equal(quote.organiserPayoutMinor, 0);
});

test('a free ticket in a paid order does not attract a fee of its own', () => {
  const quote = computeOrderFees([
    { faceMinor: 0, qty: 3 },
    { faceMinor: 1000, qty: 1 },
  ]);
  assert.equal(quote.serviceFeeMinor, 89, 'only the paid ticket should be charged');
});

test('the minimum fee floors a very cheap ticket', () => {
  // 3.99% + 49p on £1 is 53p; the floor lifts it to 79p.
  assert.equal(serviceFeeForTicket(100), 79);
});

test('there is no cap — a £250 ticket pays the full percentage', () => {
  // §26: no cap until conversion data justifies one.
  assert.equal(serviceFeeForTicket(25000), round(25000 * 0.0399) + 49);
  function round(v: number) {
    return Math.round(v);
  }
});

test('VAT is inside the displayed fee, not added to it', () => {
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 1 }]);
  assert.equal(quote.serviceFeeMinor, 249);
  assert.equal(quote.serviceFeeNetMinor + quote.vatOnFeeMinor, quote.serviceFeeMinor);
  assert.equal(quote.serviceFeeNetMinor, Math.round(249 / 1.2));
});

test('the quote is idempotent', () => {
  const a = computeOrderFees([{ faceMinor: 2500, qty: 2 }]);
  const b = computeOrderFees([{ faceMinor: 2500, qty: 2 }]);
  assert.deepEqual(a, b);
});

test('the quote carries the pricing version it was computed under', () => {
  // §16: a historical order must never be recomputed from today's config.
  const quote = computeOrderFees([{ faceMinor: 2500, qty: 1 }]);
  assert.equal(quote.pricingVersion, ZERO_FEE_CONFIG.countries.GB.version);
  assert.equal(quote.configVersion, ZERO_FEE_CONFIG.version);
});

console.log('\nPricing engine — profitability\n');

test('no canonical basket loses money on any rail', () => {
  // The hard invariant. §21: loss-making transactions are not permitted.
  const { losses } = validateFeeConfig();
  assert.deepEqual(
    losses,
    [],
    `losses: ${losses.map((b) => `${b.basket}/${b.rail} at ${b.contributionMinor}p`).join(', ')}`
  );
});

test('every basket clears the 2× cost multiple', () => {
  // True only because the floor is 79p. At the brief's published 69p, a £1 and a £5
  // ticket both ran at 1.87× — profitable, but under target.
  const { losses, belowTarget } = validateFeeConfig();
  assert.deepEqual(losses, []);
  assert.deepEqual(
    belowTarget,
    [],
    `below target: ${belowTarget.map((b) => `${b.basket}/${b.rail} at ${b.costMultiple.toFixed(2)}×`).join(', ')}`
  );
});

test('79p is the boundary, not a round number picked for comfort', () => {
  // 78p still misses on an international card, which is why 75p was not enough either.
  const short = structuredClone(ZERO_FEE_CONFIG);
  short.countries.GB.minimumServiceFeeMinor = 78;
  assert.ok(validateFeeConfig(short).belowTarget.length > 0, '78p should still miss');
});

test('an international card costs more and is still not a loss', () => {
  const quote = computeOrderFees([{ faceMinor: 1000, qty: 1 }], { rail: 'stripe_intl_card' });
  assert.notEqual(quote.economics.health, 'loss');
  assert.ok(quote.economics.meetsFloor);
});

test('mobile money is the highest-margin rail', () => {
  const lines = [{ faceMinor: 2500, qty: 2 }];
  const momo = computeOrderFees(lines, { rail: 'bitripay_momo' });
  const card = computeOrderFees(lines, { rail: 'stripe_uk_card' });
  assert.ok(
    (momo.economics.costMultiple ?? 0) > (card.economics.costMultiple ?? 0),
    'the internal rail must not be modelled as costing the same as Stripe'
  );
});

test('a config that undercharges is caught by the guard', () => {
  // §19 in miniature: the guard has to actually fail, or it proves nothing above.
  const broken = structuredClone(ZERO_FEE_CONFIG);
  broken.countries.GB.buyerServicePct = 0.1;
  broken.countries.GB.buyerFixedFeeMinor = 1;
  broken.countries.GB.minimumServiceFeeMinor = 1;
  const audit = validateFeeConfig(broken);
  assert.ok(audit.losses.length > 0, 'a 0.1% fee must produce outright losses');
});

test('the full cost stack is modelled, not just the fee-attributable part', () => {
  // The cost table applies the rail percentage to the whole charge, face value
  // included. £50 UK card: 1.5% of £52.49 = 79p, + 20p fixed, + 10p infra/AI/KODA.
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 1 }]);
  assert.equal(quote.economics.fullCostMinor, 109);
  assert.equal(
    quote.economics.netContributionMinor,
    quote.serviceFeeNetMinor - quote.economics.fullCostMinor
  );
  assert.ok(quote.economics.fullCostMinor > quote.economics.directCostMinor);
});

test('every UK card order is net-profitable on the full stack', () => {
  for (const face of [100, 500, 1000, 2500, 5000, 10000, 25000]) {
    const quote = computeOrderFees([{ faceMinor: face, qty: 1 }]);
    assert.ok(
      quote.economics.netProfitable,
      `£${face / 100} lost ${-quote.economics.netContributionMinor}p on a UK card`
    );
  }
});

test('an international card stops being profitable on high-value tickets', () => {
  /*
   * A real exposure, pinned so it cannot drift unnoticed.
   *
   * Net of VAT the fee earns 3.99 ÷ 1.2 = 3.325% of face. An international card costs
   * 3.25% of face **plus fee**, which is 3.38% of face — very slightly more. The 49p
   * fixed component covers the gap on small tickets and is exhausted at about £166,
   * turning permanently negative from roughly £193 upward.
   *
   * It matters because §26 says the percentage component is where VIP, hospitality and
   * premium inventory earn — and those are exactly the tickets that lose money when the
   * buyer pays with a foreign card. The fee cannot be varied by payment method (that is
   * a surcharge), so the levers are a negotiated international rate, routing, or a
   * higher headline percentage. None of those is an engineering decision.
   */
  const net = (faceMinor: number) =>
    computeOrderFees([{ faceMinor, qty: 1 }], { rail: 'stripe_intl_card' }).economics
      .netContributionMinor;

  // The margin is so thin near the crossover that penny rounding makes it flicker: the
  // first negative is £166.27, then it oscillates between 0 and −1p for another £27.
  // Pinning the flicker point would be pinning a rounding artefact, so what is asserted
  // is the shape — comfortably positive well below, reliably negative well above.
  assert.ok(net(10000) > 0, '£100 must still contribute');
  assert.ok(net(15000) > 0, '£150 must still contribute');
  for (let face = 19300; face <= 50000; face += 700) {
    assert.ok(net(face) < 0, `£${face / 100} should be loss-making on an international card`);
  }
});

test('mobile money is net-profitable at every price, which is the corridor argument', () => {
  const drc = structuredClone(ZERO_FEE_CONFIG);
  drc.countries.CD.active = true;
  for (const face of [100, 2500, 25000, 100000]) {
    const quote = computeOrderFees([{ faceMinor: face, qty: 1 }], {
      rail: 'bitripay_momo',
      countryCode: 'CD',
      cfg: drc,
    });
    assert.ok(quote.economics.netProfitable, `$${face / 100} lost money on mobile money`);
  }
});

test('health bands are reported, not just a boolean', () => {
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 1 }]);
  assert.equal(quote.economics.health, 'healthy');
  assert.equal(
    quote.economics.grossContributionMinor,
    quote.serviceFeeNetMinor - quote.economics.directCostMinor
  );
});

test('AI markup stays at 4× and is stated once', () => {
  assert.equal(ZERO_FEE_CONFIG.ai.markupMultiple, 4);
});

console.log('\nPricing engine — compliance\n');

test('the fee does not move with the payment method', () => {
  // UK law bans consumer card surcharges. The rail changes cost, never price.
  const rails: PaymentRail[] = [
    'stripe_uk_card',
    'stripe_intl_card',
    'bitripay_momo',
    'open_banking',
  ];
  const totals = rails.map(
    (rail) => computeOrderFees([{ faceMinor: 2500, qty: 2 }], { rail }).buyerTotalMinor
  );
  assert.equal(new Set(totals).size, 1, `buyer total varied by rail: ${totals.join(', ')}`);
});

test('the mobile-money charge is inside the advertised price, not added later', () => {
  /*
   * The 2% Congolese mobile-money service charge is the one buyer charge that varies by
   * rail. Left naive it is drip pricing: a card price on the event page, 2% more at
   * checkout. So the advertised price contains the worst rail, and every other rail is
   * a reduction from it.
   */
  const drc = structuredClone(ZERO_FEE_CONFIG);
  drc.countries.CD.active = true;

  const advertised = allInTicketPriceMinor(5000, { countryCode: 'CD', cfg: drc });

  for (const rail of ['stripe_intl_card', 'bitripay_momo'] as PaymentRail[]) {
    const paid = computeOrderFees([{ faceMinor: 5000, qty: 1 }], {
      rail,
      countryCode: 'CD',
      cfg: drc,
    }).buyerTotalMinor;
    assert.ok(
      paid <= advertised,
      `${rail} charges ${paid} against an advertised ${advertised} — that is a surprise fee`
    );
  }

  // And the mobile-money buyer pays exactly what was advertised, not less: the worst
  // rail must be a real price someone pays, not a padded one.
  const momo = computeOrderFees([{ faceMinor: 5000, qty: 1 }], {
    rail: 'bitripay_momo',
    countryCode: 'CD',
    cfg: drc,
  });
  assert.equal(momo.buyerTotalMinor, advertised);
  assert.equal(momo.railSurchargeMinor, 100); // 2% of $50
  assert.equal(momo.organiserPayoutMinor, 5000, 'the surcharge is not taken from the organiser');
});

test('the UK has no rail surcharge at all', () => {
  const quote = computeOrderFees([{ faceMinor: 5000, qty: 1 }], { rail: 'bitripay_momo' });
  assert.equal(quote.railSurchargeMinor, 0);
});

test('the DRC corridor is defined but not live', () => {
  // §19: a country does not open until its economics are proved. Defining it inactive
  // keeps the model in a diff while refusing to price against it.
  assert.equal(ZERO_FEE_CONFIG.countries.CD.active, false);
  assert.throws(() => computeOrderFees([{ faceMinor: 1000, qty: 1 }], { countryCode: 'CD' }));
});

test('an unconfigured country refuses to price rather than guessing', () => {
  // Quietly falling back to UK rates is how a market launches with unproven economics.
  assert.throws(() => computeOrderFees([{ faceMinor: 1000, qty: 1 }], { countryCode: 'ZZ' }));
});

test('the all-in price is never lower than face value on a paid ticket', () => {
  for (const [face] of WORKED) {
    assert.ok(allInTicketPriceMinor(face) > face);
  }
});

test('pounds convert to pence without drift', () => {
  assert.equal(toMinor(52.49), 5249);
  assert.equal(toMinor(0.1 + 0.2), 30);
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
