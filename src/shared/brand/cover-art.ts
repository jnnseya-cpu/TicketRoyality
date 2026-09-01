/**
 * Designed cover art — the house alternative to a stock photo.
 *
 * Every image that isn't a real, organiser-supplied photograph used to be a
 * `picsum.photos` seed: a random, unrelated stock image standing in for "a packed
 * stadium". Nothing reads as unfinished — or as machine-filled — faster than a
 * random landscape captioned as your event. "The Programme" is a print identity, and
 * a printed identity does not paper its gaps with stock photography; it engraves them.
 *
 * This builds an engraved-poster SVG from a seed: an ink ground, a guilloché of foil
 * hairlines (the rosework on a banknote or a theatre ticket), a ruled double frame,
 * corner marks, and a struck monogram. It is:
 *   - deterministic — the same seed always yields the same art, so nothing flickers
 *     between server and client render, and a given event keeps its face forever;
 *   - dependency-free and offline — pure geometry, no network, no vendor;
 *   - on-brand — ink, antique gold and curtain bordeaux, the Programme palette;
 *   - honest — it never pretends to be a photograph of a place that doesn't exist.
 *
 * `shared` depends on nothing (CLAUDE.md), so this file imports nothing and is safe to
 * pull into a server component, a plain <img>, or a CSS background alike.
 */

/* -------------------------------------------------------------------------- */
/* Seeded, deterministic randomness                                            */
/* -------------------------------------------------------------------------- */

/** FNV-1a — a small, stable string hash. Same string, same number, everywhere. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG seeded from the hash. */
function rng(state: number): () => number {
  let a = state || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* Palette — the Programme, expressed as flat ink/foil colours                 */
/* -------------------------------------------------------------------------- */

const INK = '#15100a';
const INK_DEEP = '#0d0a06';
const GOLD = '#c8a24a';
const GOLD_SOFT = '#9c7d38';
const BONE = '#e9e1cf';
const BORDEAUX = '#5c1f2b';

/** Two grounds so a wall of covers isn't one flat colour — still always ink-dark. */
const GROUNDS: Array<[string, string]> = [
  [INK, INK_DEEP],
  ['#171009', '#0e0a05'],
  ['#13100c', '#0b0805'],
  ['#181009', '#100a06'],
];

/* -------------------------------------------------------------------------- */
/* Guilloché — the engraved rosework                                           */
/* -------------------------------------------------------------------------- */

/**
 * A hypotrochoid: the curve a pen traces inside a rolling circle — the exact maths
 * behind banknote and share-certificate rosework. Sampled densely and closed into one
 * path, it draws a many-petalled foil flower that is different for every seed but
 * always reads as fine engraving rather than clip-art.
 */
function hypotrochoid(
  cx: number,
  cy: number,
  R: number,
  r: number,
  d: number,
  scale: number,
  steps: number
): string {
  let path = '';
  // Enough turns for the curve to close: R and r reduced by their gcd.
  const g = gcd(Math.round(R), Math.round(r)) || 1;
  const turns = Math.round(r / g);
  const max = Math.PI * 2 * turns;
  const inc = max / steps;
  for (let i = 0, t = 0; i <= steps; i += 1, t += inc) {
    const k = R - r;
    const x = cx + (k * Math.cos(t) + d * Math.cos((k / r) * t)) * scale;
    const y = cy + (k * Math.sin(t) - d * Math.sin((k / r) * t)) * scale;
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${path}Z`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/* -------------------------------------------------------------------------- */
/* Monogram                                                                    */
/* -------------------------------------------------------------------------- */

/** Initials from a label: first letters of up to two words, else first two chars. */
function monogram(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'TR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

export interface CoverArtOptions {
  /** Aspect: width / height. Event covers are 16:10; the hero is wide; avatars 1:1. */
  aspect?: number;
  /** Text struck across the centre. Defaults to a monogram of the seed. */
  label?: string;
  /** Draw the ruled frame + microtext. Off for tight tiles (avatars). */
  frame?: boolean;
}

/**
 * Build the full `<svg>…</svg>` markup for a cover. Kept as a string (not JSX) so it
 * serves equally as a data URI, a CSS background, or dangerouslySetInnerHTML.
 */
export function coverArtSvg(seed: string, opts: CoverArtOptions = {}): string {
  const aspect = opts.aspect ?? 1.6;
  const frame = opts.frame ?? true;
  const W = 1000;
  const H = Math.round(W / aspect);
  const cx = W / 2;
  const cy = H / 2;

  const rand = rng(hash(seed));
  const [g0, g1] = GROUNDS[Math.floor(rand() * GROUNDS.length)];
  const accent = rand() > 0.62 ? BORDEAUX : INK_DEEP; // occasional curtain band
  const uid = (hash(seed) % 100000).toString(36);

  // Two or three layered rosettes, sized to the frame.
  const base = Math.min(W, H);
  const rosettes: string[] = [];
  const layers = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < layers; i += 1) {
    const R = 60 + Math.floor(rand() * 40);
    const r = 12 + Math.floor(rand() * 26);
    const d = 14 + Math.floor(rand() * 34);
    const scale = (base * (0.42 - i * 0.09)) / R;
    const opacity = (0.5 - i * 0.12).toFixed(2);
    const stroke = i === 0 ? GOLD : GOLD_SOFT;
    rosettes.push(
      `<path d="${hypotrochoid(cx, cy, R, r, d, scale, 720)}" fill="none" stroke="${stroke}" stroke-width="${(0.9 - i * 0.2).toFixed(2)}" opacity="${opacity}"/>`
    );
  }

  const mono = monogram(opts.label ?? seed);
  const monoSize = frame ? Math.round(H * 0.34) : Math.round(H * 0.42);

  // Ruled double frame, inset from the edge.
  const pad = Math.round(W * 0.035);
  const framing = frame
    ? `
    <rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" fill="none" stroke="${GOLD}" stroke-width="1.4" opacity="0.75"/>
    <rect x="${pad + 6}" y="${pad + 6}" width="${W - pad * 2 - 12}" height="${H - pad * 2 - 12}" fill="none" stroke="${GOLD_SOFT}" stroke-width="0.7" opacity="0.55"/>
    ${corner(pad + 16, pad + 16)}${corner(W - pad - 16, pad + 16)}${corner(pad + 16, H - pad - 16)}${corner(W - pad - 16, H - pad - 16)}
    <text x="${cx}" y="${H - pad - 14}" text-anchor="middle" fill="${GOLD}" opacity="0.6" font-family="'Space Mono','SFMono-Regular',monospace" font-size="13" letter-spacing="6">· TICKETROYALITY ·</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  <defs>
    <radialGradient id="g${uid}" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="${g0}"/>
      <stop offset="100%" stop-color="${g1}"/>
    </radialGradient>
    <linearGradient id="v${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g${uid})"/>
  ${accent === BORDEAUX ? `<rect width="${Math.round(W * 0.14)}" height="${H}" fill="${BORDEAUX}" opacity="0.5"/>` : ''}
  <g>${rosettes.join('')}</g>
  <circle cx="${cx}" cy="${cy}" r="${Math.round(H * 0.28)}" fill="none" stroke="${GOLD}" stroke-width="0.8" opacity="0.4"/>
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${BONE}" font-family="'Bodoni Moda','Didot','Times New Roman',serif" font-weight="600" font-size="${monoSize}" letter-spacing="2">${escapeXml(mono)}</text>
  <rect width="${W}" height="${H}" fill="url(#v${uid})"/>
  ${framing}
</svg>`;
}

/** A small foil corner mark — a plus with a hairline, the register cross of a proof. */
function corner(x: number, y: number): string {
  return `<g stroke="${GOLD}" stroke-width="1" opacity="0.7"><line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}"/><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 7}"/></g>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The same art as a data URI, for anywhere that needs a string `src` — a plain
 * `<img>`, a CSS `background-image`, an `og:image` fallback. URL-encoded (not base64)
 * so it stays compact and legible.
 */
export function coverArtDataUri(seed: string, opts: CoverArtOptions = {}): string {
  const svg = coverArtSvg(seed, opts).replace(/\n\s*/g, ' ').trim();
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A square monogram tile — the house avatar for organisers and speakers with no photo. */
export function monogramDataUri(seed: string, label?: string): string {
  return coverArtDataUri(seed, { aspect: 1, frame: false, label });
}
