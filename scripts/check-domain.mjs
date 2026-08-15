#!/usr/bin/env node
/**
 * Domain readiness check for the custom-domain cutover.
 *
 *   node scripts/check-domain.mjs
 *   node scripts/check-domain.mjs --domain ticketroyality.com
 *
 * Two failure modes make this worth a script rather than a paragraph in DEPLOY.md.
 *
 * The first is silent and total: Hostinger points a new domain at its own landing page
 * with an `A` record on the root. Adding Firebase's records *beside* it rather than
 * replacing it leaves DNS round-robining between the app and a parking page, so the
 * site works for roughly half of visitors and looks fine to whoever is testing.
 *
 * The second is worse because it breaks something that was working: the `MX` and SPF
 * records carry mail for info@ticketroyality.com, which is the mailbox every ticket
 * email is sent from. Clearing them while "tidying up DNS" takes out ticket delivery
 * and the inbox together, and the symptom arrives hours later as customers who paid and
 * received nothing.
 *
 * So this reports what is actually in DNS and says plainly which state it is in.
 */

import { promises as dns } from 'node:dns';

const args = process.argv.slice(2);
const domainArg = args.indexOf('--domain');
const DOMAIN = domainArg !== -1 ? args[domainArg + 1] : 'ticketroyality.com';

// Hostinger's shared-hosting ranges. Not exhaustive and not meant to be — this only
// has to recognise "still parked" confidently enough to warn.
const HOSTINGER_HINTS = ['2.57.9', '145.14.', '84.32.', '156.67.', '31.220.'];

const tick = (ok) => (ok ? '✓' : '✗');
let problems = 0;
let warnings = 0;

async function lookup(fn, name) {
  try {
    return await dns[fn](name);
  } catch (error) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') return null;
    throw error;
  }
}

console.log(`\nDNS for ${DOMAIN}\n`);

/* ---------------------------------------------------------------- */
/* A — where the website points                                     */
/* ---------------------------------------------------------------- */

const a = await lookup('resolve4', DOMAIN);
if (!a || a.length === 0) {
  console.log(`  ${tick(false)} A       none. The root domain resolves nowhere.`);
  problems++;
} else {
  const parked = a.filter((ip) => HOSTINGER_HINTS.some((prefix) => ip.startsWith(prefix)));
  console.log(`  ${tick(parked.length === 0)} A       ${a.join(', ')}`);

  if (parked.length > 0 && parked.length === a.length) {
    console.log(`          ↳ This is still Hostinger. The domain has NOT been pointed at`);
    console.log(`            App Hosting yet — visitors are seeing Hostinger, not the app.`);
    problems++;
  } else if (parked.length > 0) {
    console.log(`          ↳ MIXED: ${parked.join(', ')} looks like Hostinger and is still`);
    console.log(`            present alongside the others. DNS will round-robin between`);
    console.log(`            them, so the site breaks for a share of visitors. Delete the`);
    console.log(`            Hostinger A record rather than adding beside it.`);
    problems++;
  }
}

/* ---------------------------------------------------------------- */
/* MX + SPF — mail, which must survive the cutover untouched        */
/* ---------------------------------------------------------------- */

const mx = await lookup('resolveMx', DOMAIN);
if (!mx || mx.length === 0) {
  console.log(`  ${tick(false)} MX      none. Mail to info@${DOMAIN} is dead, and that mailbox`);
  console.log(`            sends every ticket email.`);
  problems++;
} else {
  const hostinger = mx.some((r) => r.exchange.includes('hostinger'));
  console.log(
    `  ${tick(hostinger)} MX      ${mx.map((r) => `${r.exchange} (${r.priority})`).join(', ')}`
  );
  if (!hostinger) {
    console.log(`          ↳ Not pointing at Hostinger. Ticket email sends via that mailbox.`);
    warnings++;
  }
}

const txt = (await lookup('resolveTxt', DOMAIN)) ?? [];
const flat = txt.map((parts) => parts.join(''));
const spf = flat.find((v) => v.startsWith('v=spf1'));
console.log(`  ${tick(Boolean(spf))} SPF     ${spf ?? 'none — outbound mail is more likely to be junked'}`);
if (!spf) warnings++;

const dkim = await lookup('resolveTxt', `hostingermail._domainkey.${DOMAIN}`);
console.log(`  ${tick(Boolean(dkim))} DKIM    ${dkim ? 'present' : 'not found on the Hostinger selector'}`);
if (!dkim) warnings++;

const firebaseVerification = flat.filter((v) => v.startsWith('firebase='));
if (firebaseVerification.length > 0) {
  console.log(`  ${tick(true)} VERIFY  ${firebaseVerification.join(', ')}`);
}

/* ---------------------------------------------------------------- */
/* www                                                              */
/* ---------------------------------------------------------------- */

const wwwCname = await lookup('resolveCname', `www.${DOMAIN}`);
const wwwA = wwwCname ? null : await lookup('resolve4', `www.${DOMAIN}`);
if (wwwCname) {
  console.log(`  ${tick(true)} www     CNAME → ${wwwCname.join(', ')}`);
} else if (wwwA) {
  console.log(`  ${tick(true)} www     A → ${wwwA.join(', ')}`);
} else {
  console.log(`  ${tick(false)} www     nothing. www.${DOMAIN} will not resolve.`);
  warnings++;
}

/* ---------------------------------------------------------------- */

console.log('');
if (problems > 0) {
  console.log(`${problems} problem(s), ${warnings} warning(s).`);
  console.log(`\nThe cutover is not complete. In Firebase console → App Hosting → your`);
  console.log(`backend → Add custom domain, then copy the records it gives you into`);
  console.log(`Hostinger → Domains → ${DOMAIN} → DNS.`);
  console.log(`\nReplace the existing root A record. Do not touch MX or the SPF TXT.`);
  process.exit(1);
}

console.log(`${warnings > 0 ? `${warnings} warning(s). ` : ''}Web and mail records both look right.`);
console.log(`\nDNS resolving is not the same as the certificate being issued — that can`);
console.log(`take up to 24 hours, and a "not secure" warning in the meantime is normal.`);
