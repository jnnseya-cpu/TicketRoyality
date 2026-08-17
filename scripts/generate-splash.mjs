/**
 * Generates the iOS launch screens into `public/splash/`.
 *
 * Run with: npm run generate:splash
 *
 * The images are committed, because App Hosting builds from the repository and a build
 * step that shells out to a native image library is a build that breaks on the day the
 * library changes. This script exists so they are reproducible rather than hand-made
 * binaries nobody can regenerate — change the mark or the palette here, re-run it, and
 * commit what comes out.
 *
 * The artwork is deliberately the same on every size: a centred mark, the wordmark, and
 * the background colour the app itself opens on. A launch screen that mimics the first
 * screen of the app is Apple's own advice, but it ages badly — this one cannot go stale
 * because it makes no claim about what the app looks like inside.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'public', 'splash');

/** Matches `background_color` in the manifest and `--background` in dark mode. */
const BACKGROUND = '#0B0B0F';
const GOLD = '#F5A524';
const MUTED = '#8A8A93';

/*
 * Kept in step with `src/shared/pwa/splash.ts` by hand rather than imported: this is a
 * plain Node script and that file is TypeScript inside the app's path aliases. The list
 * is checked at the end — a mismatch fails the run rather than silently generating the
 * wrong set.
 */
const DEVICES = [
  [320, 568, 2],
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 736, 3],
  [414, 896, 2],
  [414, 896, 3],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
  [744, 1133, 2],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [1024, 1366, 2],
];

/** The mark from `src/app/icon.svg`, without its rounded tile. */
const MARK = `
  <path d="M4 6.5 8.5 11 16 4l7.5 7L28 6.5V13H4V6.5Z" fill="${GOLD}"/>
  <path d="M4 15.5h24a2.5 2.5 0 0 0 0 5V26a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5.5a2.5 2.5 0 0 0 0-5Z"
        fill="none" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M13 19v6" stroke="${GOLD}" stroke-width="2" stroke-linecap="round" stroke-dasharray="1.5 3"/>
`;

function artwork(width, height) {
  const short = Math.min(width, height);

  /*
   * Sized off the short edge so the mark occupies the same proportion of the visible
   * screen on a 12.9" iPad in landscape as on an SE in portrait. Sizing off the long
   * edge produces a mark that is comfortable on a phone and absurd on a tablet.
   */
  const mark = Math.round(short * 0.22);
  /*
   * Letter-spacing is added *after* the final glyph as well as between them, so
   * `text-anchor="middle"` centres a box that is one space too wide and the wordmark
   * lands visibly right of centre. Every x below pulls back half a space to correct it.
   */
  const wordSize = Math.max(14, Math.round(short * 0.045));
  const taglineSize = Math.max(10, Math.round(short * 0.026));

  // The block sits slightly above centre. Dead-centre reads as low, because the eye
  // treats the optical centre as being above the mathematical one.
  const blockTop = Math.round(height / 2 - mark * 0.95);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BACKGROUND}"/>
  <svg x="${Math.round((width - mark) / 2)}" y="${blockTop}" width="${mark}" height="${mark}" viewBox="0 0 32 32">${MARK}</svg>
  <text x="${width / 2 - (wordSize * 0.12) / 2}" y="${blockTop + mark + wordSize * 1.5}"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="${wordSize}" font-weight="700" letter-spacing="${wordSize * 0.12}"
        fill="${GOLD}" text-anchor="middle">TICKETROYALITY</text>
  <text x="${width / 2 - (taglineSize * 0.08) / 2}" y="${blockTop + mark + wordSize * 1.5 + taglineSize * 2.2}"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="${taglineSize}" letter-spacing="${taglineSize * 0.08}"
        fill="${MUTED}" text-anchor="middle">Where Every Ticket Feels Royal</text>
</svg>`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  let written = 0;
  let bytes = 0;

  for (const [cssWidth, cssHeight, ratio] of DEVICES) {
    const long = cssHeight * ratio;
    const short = cssWidth * ratio;

    for (const [width, height] of [
      [short, long],
      [long, short],
    ]) {
      const file = path.join(OUT, `apple-splash-${width}x${height}.png`);
      const png = await sharp(artwork(width, height))
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();

      await writeFile(file, png);
      written += 1;
      bytes += png.length;
    }
  }

  console.log(
    `splash: wrote ${written} images (${(bytes / 1024).toFixed(0)} KB total) to public/splash`
  );

  // The document's link list and this generator must describe the same set. A device
  // added to one and not the other produces either a dead link or an unused file, and
  // both are invisible until somebody with that phone installs the app.
  const links = path.join(HERE, '..', 'src', 'shared', 'pwa', 'splash.ts');
  const source = await import('node:fs/promises').then((fs) => fs.readFile(links, 'utf8'));
  const declared = [...source.matchAll(/width: (\d+), height: (\d+), ratio: (\d)/g)].map((m) =>
    m.slice(1, 4).join('x')
  );
  const generated = DEVICES.map((d) => d.join('x'));

  const missing = declared.filter((d) => !generated.includes(d));
  const extra = generated.filter((d) => !declared.includes(d));

  if (missing.length || extra.length) {
    console.error('splash: device lists disagree');
    if (missing.length) console.error(`  declared but not generated: ${missing.join(', ')}`);
    if (extra.length) console.error(`  generated but not declared: ${extra.join(', ')}`);
    process.exit(1);
  }

  console.log(`splash: ${declared.length} devices, matching src/shared/pwa/splash.ts`);
}

await main();
