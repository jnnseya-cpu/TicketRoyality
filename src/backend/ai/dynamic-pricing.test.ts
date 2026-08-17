/**
 * Dynamic pricing clamp tests. Run with: npm run test:dynamic-pricing
 *
 * The clamp is the only thing standing between a model's confident nonsense and a price
 * an organiser can apply in one click. A language model asked about pricing will
 * occasionally return £0, or four times the current price, with an entirely plausible
 * sentence attached — and the suggestion is presented next to an Apply button.
 *
 * So these tests are about what the platform refuses to suggest, not about what the
 * model says. Everything here runs offline: `clamp` is pure.
 */
import assert from 'node:assert/strict';

import { dynamicPricingTask } from './tasks';
import type { DynamicPricingInput, DynamicPricingOutput } from './schemas';

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

const input: DynamicPricingInput = {
  eventTitle: 'Royal Night at Wembley',
  category: 'Music',
  location: 'London',
  currency: 'GBP',
  daysUntilEvent: 30,
  daysOnSale: 10,
  tiers: [
    { id: 'ga', name: 'General', price: 50, quantity: 100, sold: 80 },
    { id: 'free', name: 'Guest list', price: 0, quantity: 50, sold: 10 },
  ],
};

const clamp = (output: DynamicPricingOutput) => dynamicPricingTask.clamp!(output, input);

console.log('\nDynamic pricing clamp\n');

test('a sane rise is passed through', () => {
  const out = clamp({ summary: '', suggestions: [{ tierId: 'ga', suggestedPrice: 60, reason: 'r' }] });
  assert.equal(out.suggestions[0].suggestedPrice, 60);
});

test('a rise beyond +40% is capped, not rejected', () => {
  // Rejecting outright would hide a real signal — demand is strong — behind silence.
  const out = clamp({
    summary: '',
    suggestions: [{ tierId: 'ga', suggestedPrice: 200, reason: 'r' }],
  });
  assert.equal(out.suggestions[0].suggestedPrice, 70);
});

test('a cut beyond -40% is floored', () => {
  const out = clamp({ summary: '', suggestions: [{ tierId: 'ga', suggestedPrice: 5, reason: 'r' }] });
  assert.equal(out.suggestions[0].suggestedPrice, 30);
});

test('a suggested price of zero cannot make a paid tier free', () => {
  // The failure that costs the most: every remaining ticket given away for nothing.
  const out = clamp({ summary: '', suggestions: [{ tierId: 'ga', suggestedPrice: 0, reason: 'r' }] });
  assert.equal(out.suggestions[0].suggestedPrice, 30);
});

test('a negative price never survives', () => {
  const out = clamp({
    summary: '',
    suggestions: [{ tierId: 'ga', suggestedPrice: -20, reason: 'r' }],
  });
  assert.ok(out.suggestions[0].suggestedPrice >= 0);
});

test('a free tier is never made paid', () => {
  // A £0 tier is a wedding guest list or a church service, not an underpriced ticket.
  // Charging for it would be the platform inventing a fee its owner never agreed to.
  const out = clamp({
    summary: '',
    suggestions: [{ tierId: 'free', suggestedPrice: 25, reason: 'r' }],
  });
  assert.equal(out.suggestions.length, 0, 'a free tier held at free is not a suggestion');
});

test('a tier id the model invented is dropped', () => {
  const out = clamp({
    summary: '',
    suggestions: [{ tierId: 'vip-does-not-exist', suggestedPrice: 99, reason: 'r' }],
  });
  assert.equal(out.suggestions.length, 0);
});

test('a suggestion identical to the current price is not shown', () => {
  const out = clamp({ summary: '', suggestions: [{ tierId: 'ga', suggestedPrice: 50, reason: 'r' }] });
  assert.equal(out.suggestions.length, 0);
});

test('prices are rounded to whole pence', () => {
  const out = clamp({
    summary: '',
    suggestions: [{ tierId: 'ga', suggestedPrice: 55.5551, reason: 'r' }],
  });
  assert.equal(out.suggestions[0].suggestedPrice, 55.56);
});

test('the summary is preserved', () => {
  const out = clamp({ summary: 'Selling ahead of pace.', suggestions: [] });
  assert.equal(out.summary, 'Selling ahead of pace.');
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
