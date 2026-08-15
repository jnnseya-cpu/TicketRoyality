#!/usr/bin/env node
/**
 * Turns a secret on in `apphosting.yaml`.
 *
 * Every secret in that file ships commented out, because App Hosting fails the *whole*
 * rollout when a declared secret is missing from Secret Manager — that takes down the
 * catalogue, the blog and every page needing no keys at all, not just the one feature.
 * So the order is always: create the secret, grant access, then uncomment.
 *
 * Uncommenting by hand is where this goes wrong. The blocks are four lines of
 * indentation-sensitive YAML, and a half-uncommented block is invalid YAML that fails
 * the deploy in a way that looks nothing like its cause.
 *
 *   node scripts/enable-secret.mjs STRIPE_SECRET_KEY GEMINI_API_KEY
 *   node scripts/enable-secret.mjs --list
 *   node scripts/enable-secret.mjs --check          # verify the file still parses
 *
 * This only edits the file. It never touches Secret Manager and never sees a value.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'apphosting.yaml');

const args = process.argv.slice(2);
const source = readFileSync(FILE, 'utf8');
const lines = source.split('\n');

/**
 * Finds every `- variable: NAME` block, commented or not.
 *
 * A block runs from its `- variable:` line to the line before the next entry, so the
 * `availability:` list travels with it. Matching on the whole block rather than a
 * single line is what stops a partial uncomment.
 */
function findBlocks() {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)#?\s*-\s*variable:\s*(\S+)\s*$/);
    if (!match) continue;

    const name = match[2];
    const commented = /^\s*#/.test(lines[i]);
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      // The next entry, or a blank line followed by anything that is not part of
      // this block, ends it.
      if (/^\s*#?\s*-\s*variable:/.test(lines[j])) break;
      if (lines[j].trim() === '') break;
      // A comment line that is prose, not YAML, ends the block too.
      if (commented && !/^\s*#\s{2,}(secret|value|availability|-)/.test(lines[j])) break;
      if (!commented && !/^\s{4,}/.test(lines[j])) break;
      end = j;
    }
    blocks.push({ name, start: i, end, commented });
  }
  return blocks;
}

const blocks = findBlocks();

if (args.includes('--list') || args.length === 0) {
  console.log('\napphosting.yaml variables:\n');
  for (const b of blocks) {
    console.log(`  ${b.commented ? 'OFF' : 'ON '}  ${b.name}`);
  }
  console.log('\nEnable one with:  node scripts/enable-secret.mjs <NAME> [...]');
  console.log('Create it in Secret Manager FIRST, or the rollout fails:\n');
  console.log('  firebase apphosting:secrets:set <NAME> --project ticketroyality');
  console.log('  firebase apphosting:secrets:grantaccess <NAME> \\');
  console.log('    --backend ticketroyality --project ticketroyality\n');
  process.exit(0);
}

if (args.includes('--check')) {
  // Cheap structural check: no half-commented blocks.
  let bad = 0;
  for (const b of blocks) {
    const body = lines.slice(b.start, b.end + 1);
    const commented = body.filter((l) => /^\s*#/.test(l)).length;
    if (commented !== 0 && commented !== body.length) {
      console.error(`✗ ${b.name} is half-commented (lines ${b.start + 1}-${b.end + 1})`);
      bad++;
    }
  }
  if (bad > 0) process.exit(1);
  console.log(`✓ ${blocks.length} variable blocks, none half-commented`);
  process.exit(0);
}

let changed = 0;
for (const name of args) {
  const block = blocks.find((b) => b.name === name);
  if (!block) {
    console.error(`✗ ${name} is not declared in apphosting.yaml.`);
    console.error(`  Run --list to see the names, and add the block if it is genuinely new.`);
    process.exitCode = 1;
    continue;
  }
  if (!block.commented) {
    console.log(`· ${name} is already enabled`);
    continue;
  }
  for (let i = block.start; i <= block.end; i++) {
    // Strip exactly one leading '#', preserving the indentation that follows it.
    lines[i] = lines[i].replace(/^(\s*)#/, '$1');
  }
  console.log(`✓ ${name} enabled`);
  changed++;
}

if (changed > 0) {
  writeFileSync(FILE, lines.join('\n'));
  console.log(`\nUpdated apphosting.yaml. Now:`);
  console.log(`  git add apphosting.yaml && git commit -m "Enable ${args.join(', ')}" && git push`);
  console.log(`\nApp Hosting redeploys on push. If the secret does not exist in Secret`);
  console.log(`Manager yet, that rollout will fail and take the whole site with it.`);
}
