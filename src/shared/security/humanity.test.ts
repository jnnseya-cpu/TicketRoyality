/**
 * Humanity gate tests. Run with: npm run test:humanity
 *
 * Written after the gate refused the platform owner creating the admin account.
 *
 * The honeypot was named `company_website_url` — attractive to a bot, and equally
 * attractive to Chrome's address autofill, which matches on `organization` and `url`.
 * Filling the visible address fields filled the hidden one, which scored 70 and refused
 * outright on a single signal.
 *
 * The asymmetry that matters, and that these tests encode: a wrong refusal is a customer
 * who never comes back; a wrong allow is one spam account an admin suspends in a click.
 * So no single signal may refuse on its own.
 */
import assert from 'node:assert/strict';

import { assessRisk, type RequestSignals } from './humanity';

const results: Array<[string, boolean, string]> = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    results.push([name, true, '']);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push([name, false, message]);
    console.error(`  ✗ ${name}\n      ${message.split('\n')[0]}`);
  }
}

/** A person filling the form by hand: took time, typed, tripped nothing. */
const human: RequestSignals = {
  fillMillis: 45_000,
  humanInteraction: true,
  honeypotTripped: false,
};

console.log('\nHumanity gate\n');

test('a person filling the form normally is allowed', () => {
  assert.equal(assessRisk(human).action, 'allow');
});

test('a person using an admin@ address is still allowed', () => {
  // The case that broke: role addresses score, but scoring is not refusing.
  const verdict = assessRisk({ ...human, roleAddress: true });
  assert.equal(verdict.action, 'allow', `admin@ scored ${verdict.score}`);
});

test('the honeypot alone never refuses', () => {
  // Autofill and password managers fill hidden fields. One signal must not lock a
  // real person out of the platform.
  const verdict = assessRisk({ ...human, honeypotTripped: true });
  assert.notEqual(verdict.action, 'refuse', `honeypot alone scored ${verdict.score}`);
});

test('honeypot plus a role address still does not refuse a real person', () => {
  // Exactly the combination that refused the owner: autofilled hidden field, admin@.
  const verdict = assessRisk({ ...human, honeypotTripped: true, roleAddress: true });
  assert.notEqual(
    verdict.action,
    'refuse',
    `autofilled honeypot + admin@ scored ${verdict.score} — this is the regression`
  );
});

test('honeypot plus an impossibly fast fill does refuse', () => {
  // A hidden field completed in under a second is not a person with autofill.
  const verdict = assessRisk({ fillMillis: 200, humanInteraction: true, honeypotTripped: true });
  assert.equal(verdict.action, 'refuse', `scored ${verdict.score}`);
});

test('honeypot plus no interaction at all does refuse', () => {
  const verdict = assessRisk({
    fillMillis: 45_000,
    humanInteraction: false,
    honeypotTripped: true,
  });
  assert.equal(verdict.action, 'refuse', `scored ${verdict.score}`);
});

test('a scripted fill — instant, no events, honeypot tripped — is refused', () => {
  const verdict = assessRisk({ fillMillis: 50, humanInteraction: false, honeypotTripped: true });
  assert.equal(verdict.action, 'refuse');
  assert.equal(verdict.band, 'severe');
});

test('a fast fill with no interaction is challenged even without the honeypot', () => {
  const verdict = assessRisk({ fillMillis: 200, humanInteraction: false });
  assert.notEqual(verdict.action, 'allow', 'scripted signup must not sail through');
});

test('a VPN is never scored against anyone', () => {
  const withVpn = assessRisk({ ...human, knownVpn: true });
  assert.equal(withVpn.score, assessRisk(human).score, 'privacy is not evidence of fraud');
  assert.equal(withVpn.action, 'allow');
});

test('missing signals are treated as unproven, not hostile', () => {
  // App Check is not enforced yet, so `attested` is absent on every real request.
  assert.equal(assessRisk({}).action, 'allow');
});

test('a disposable address plus scripted behaviour is refused', () => {
  const verdict = assessRisk({
    disposableEmail: true,
    fillMillis: 300,
    humanInteraction: false,
    datacentreIp: true,
  });
  assert.equal(verdict.action, 'refuse');
});

test('the score never exceeds 100', () => {
  const verdict = assessRisk({
    honeypotTripped: true,
    fillMillis: 10,
    humanInteraction: false,
    datacentreIp: true,
    attested: false,
    disposableEmail: true,
    roleAddress: true,
    networkVelocity: 50,
    deviceReuse: 20,
    impossibleTravel: true,
    newDevice: true,
  });
  assert.equal(verdict.score, 100);
  assert.equal(verdict.action, 'refuse');
});

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length > 0) process.exit(1);
