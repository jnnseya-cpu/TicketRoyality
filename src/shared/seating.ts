import type { SeatingSection } from '@/shared/types';

/**
 * Seats, in rooms that are not rectangles.
 *
 * ## Why the grid was not enough
 *
 * A `SeatingSection` describes `rows × seatsPerRow`, which is a spreadsheet, not a room.
 * Almost no real venue is one: a stalls curve outwards so the back rows are longer, a
 * gangway splits row F into 1–8 and 9–16, a pillar removes D7 and D8, most theatres skip
 * row I because it reads as a 1, and a cabaret room is rows of six around tables. Forcing
 * those into a rectangle means either selling seats that do not exist or hiding seats that
 * do, and both are found out on the night.
 *
 * So a section may carry `rowSpec`: one entry per row, each with its own seat count. When
 * it is absent — which is every section built before this existed — the rectangle is
 * generated exactly as before, so nothing changes for anyone who was happy with it.
 *
 * ## What "together" means, precisely
 *
 * Two seats are adjacent if they are next to each other **in the same row with no gangway
 * between them**. Seats either side of an aisle are not together, whatever their numbers
 * say, and a group told they are sitting together and then separated by a gangway has
 * been misled by software rather than by a person. That distinction is why `aisleAfter`
 * exists and why it breaks contiguity rather than only affecting the drawing.
 *
 * This module is pure: it does geometry and choosing, never availability. What is taken
 * comes from the server, because only the server can see tickets and locks.
 */

/** One row of a section, when the section is not a rectangle. */
export interface SeatRowSpec {
  /** The row's own label — "A", "AA", "Table 3". Not derived, because rooms skip letters. */
  name: string;
  /** How many seats this row has. */
  seats: number;
  /** First seat number, for a row that does not start at 1. */
  from?: number;
  /** Seat numbers that do not exist — a pillar, a camera position, a missing chair. */
  missing?: number[];
  /** A gangway after these seat numbers. Breaks adjacency, not only the drawing. */
  aisleAfter?: number[];
  /** Visual indent in half-seat units, for a staggered or curved room. Drawing only. */
  offset?: number;
}

export interface Seat {
  /** "F12" — what is printed on the ticket and said at the door. */
  label: string;
  row: string;
  number: number;
  /** Position within the row, counting from the left. Used for adjacency and centring. */
  index: number;
  /** True when a gangway follows this seat. */
  aisleAfter: boolean;
  /** Which row this is, counting from the front of the section. */
  rowIndex: number;
  sectionId: string;
  offset: number;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Row letters theatres routinely skip: read aloud and in print, I and O become 1 and 0. */
const CONFUSABLE = new Set(['I', 'O']);

function letters(index: number): string {
  if (index < 26) return ALPHABET[index];
  // Past Z, carry into AA, AB… rather than emitting punctuation.
  return `${ALPHABET[Math.floor(index / 26) - 1]}${ALPHABET[index % 26]}`;
}

/**
 * Row labels for a rectangular section: A, B, C…
 *
 * **Deliberately unchanged**, including I and O, because a section built before this
 * module existed may already have tickets printed with those labels — and a label that
 * silently shifts turns a sold seat into a free one on the map and an unknown seat at the
 * door. `suggestedRowNames` is what the builder offers for a *new* section; this is what
 * the reader must keep doing for an old one.
 */
export function generatedRowNames(startRow: string, rows: number): string[] {
  const start = Math.max(0, ALPHABET.indexOf((startRow || 'A').toUpperCase()[0]));
  return Array.from({ length: rows }, (_, i) => letters(start + i));
}

/**
 * What the builder proposes for a new section: the same sequence with I and O left out.
 *
 * "Row I seat 1" is heard as "row 1 seat 1" often enough that the industry stopped using
 * it. Offered rather than imposed — the names end up written down explicitly, so an
 * organiser who wants row I keeps it.
 */
export function suggestedRowNames(startRow: string, rows: number): string[] {
  const names: string[] = [];
  let i = Math.max(0, ALPHABET.indexOf((startRow || 'A').toUpperCase()[0]));

  while (names.length < rows) {
    const name = letters(i);
    if (!CONFUSABLE.has(name)) names.push(name);
    i += 1;
  }

  return names;
}

/** The rows of a section, irregular if it says so and rectangular if it does not. */
export function sectionRows(section: SeatingSection): SeatRowSpec[] {
  if (section.rowSpec?.length) return section.rowSpec;

  return generatedRowNames(section.startRow, section.rows).map((name) => ({
    name,
    seats: section.seatsPerRow,
  }));
}

/** Every seat in a section, in the order a person walking the row would meet them. */
export function sectionSeats(section: SeatingSection): Seat[] {
  const seats: Seat[] = [];

  sectionRows(section).forEach((row, rowIndex) => {
    const from = row.from ?? 1;
    const missing = new Set(row.missing ?? []);
    const aisles = new Set(row.aisleAfter ?? []);
    let index = 0;

    for (let n = from; n < from + row.seats; n += 1) {
      // A missing seat consumes its number and nothing else: D8 stays D8 for everyone who
      // has already been told where they are sitting, whatever was removed beside it.
      if (missing.has(n)) continue;

      seats.push({
        label: `${row.name}${n}`.toUpperCase(),
        row: row.name.toUpperCase(),
        number: n,
        index,
        aisleAfter: aisles.has(n),
        rowIndex,
        sectionId: section.id,
        offset: row.offset ?? 0,
      });
      index += 1;
    }
  });

  return seats;
}

/** How many seats a section actually holds — the number a capacity is checked against. */
export function sectionCapacity(section: SeatingSection): number {
  return sectionSeats(section).length;
}

export interface Allocation {
  seats: string[];
  /** False when the group had to be split, which the buyer is told rather than shown. */
  together: boolean;
  /** How many separate blocks the party was split into. `1` when together. */
  blocks: number;
}

interface Run {
  seats: Seat[];
  rowIndex: number;
  /** How long the row is, for working out how central a block within it is. */
  rowLength: number;
}

/**
 * Unbroken stretches of free seats. A gangway ends a run, because seats across an aisle
 * are not seats together.
 */
function freeRuns(seats: Seat[], taken: Set<string>): Run[] {
  const runs: Run[] = [];
  const byRow = new Map<string, Seat[]>();

  for (const seat of seats) {
    const key = `${seat.sectionId}::${seat.row}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key)!.push(seat);
  }

  for (const row of byRow.values()) {
    let current: Seat[] = [];

    const flush = () => {
      if (current.length > 0) {
        runs.push({ seats: current, rowIndex: current[0].rowIndex, rowLength: row.length });
        current = [];
      }
    };

    for (const seat of row) {
      if (taken.has(seat.label)) flush();
      else current.push(seat);
      if (seat.aisleAfter) flush();
    }
    flush();
  }

  return runs;
}

/** Rows near the front are worth more than rows near the back, but not by much per row. */
const ROW_WEIGHT = 2;
/** Leaving one seat stranded at the end of a run is worth avoiding, not worth refusing. */
const ORPHAN_PENALTY = 6;

/**
 * Score a block: lower is better.
 *
 * Front rows beat back rows, the middle of a row beats its edges, and a choice that
 * strands a single seat beside it is penalised — a lone seat between two parties is the
 * seat that never sells, and a box office that fills a house by hand knows to avoid
 * creating one. None of this is a rule the buyer is told; it is what "best available"
 * has always meant.
 */
function scoreBlock(run: Run, start: number, size: number): number {
  const centre = (run.rowLength - 1) / 2;
  const blockCentre = run.seats[start].index + (size - 1) / 2;

  const before = start;
  const after = run.seats.length - (start + size);
  const orphans = (before === 1 ? 1 : 0) + (after === 1 ? 1 : 0);

  return (
    run.rowIndex * ROW_WEIGHT + Math.abs(blockCentre - centre) + orphans * ORPHAN_PENALTY
  );
}

/**
 * Choose the best `quantity` seats.
 *
 * ## Together first, and only then comfortable
 *
 * Four people who booked together and are given four excellent seats in four different
 * rows have been given the wrong answer, so seating them together outranks every other
 * consideration. Only when no single stretch is long enough does this split the party —
 * into the fewest blocks it can, and it says so in the result rather than quietly handing
 * back scattered seats and letting the buyer discover it on the tickets.
 *
 * Returns `null` when there are not enough free seats at all, which is a different answer
 * from a split and must not be dressed up as one.
 */
export function bestAvailable(
  sections: SeatingSection[],
  tierId: string,
  quantity: number,
  taken: Iterable<string>
): Allocation | null {
  if (quantity < 1) return null;

  const takenSet = new Set([...taken].map((s) => s.toUpperCase()));
  const eligible = sections.filter((section) => section.tierId === tierId);

  const seats: Seat[] = [];
  for (const section of eligible) {
    // Held back is not the same as sold, but for choosing it is: neither is for sale here.
    // Accessible seats are booked by phone precisely so a person's needs are asked about
    // rather than guessed, and "best available" must never hand one out by accident.
    const blocked = new Set(
      [...(section.unavailableSeats ?? []), ...(section.accessibleSeats ?? [])].map((s) =>
        s.toUpperCase()
      )
    );
    for (const seat of sectionSeats(section)) {
      if (!blocked.has(seat.label)) seats.push(seat);
    }
  }

  const runs = freeRuns(seats, takenSet);
  const free = runs.reduce((total, run) => total + run.seats.length, 0);
  if (free < quantity) return null;

  let best: { seats: string[]; score: number } | null = null;

  for (const run of runs) {
    for (let start = 0; start + quantity <= run.seats.length; start += 1) {
      const score = scoreBlock(run, start, quantity);
      if (!best || score < best.score) {
        best = {
          score,
          seats: run.seats.slice(start, start + quantity).map((seat) => seat.label),
        };
      }
    }
  }

  if (best) return { seats: best.seats, together: true, blocks: 1 };

  /*
   * Nothing holds the whole party. Take the longest runs first so the split is into as
   * few groups as possible — three and one is a worse night out than two and two only
   * because of how many people end up sitting alone, and the longest-first order is what
   * minimises that.
   */
  const chosen: string[] = [];
  let blocks = 0;

  const ordered = [...runs].sort(
    (a, b) => b.seats.length - a.seats.length || a.rowIndex - b.rowIndex
  );

  for (const run of ordered) {
    if (chosen.length >= quantity) break;
    const want = Math.min(run.seats.length, quantity - chosen.length);
    const start = Math.max(0, Math.floor((run.seats.length - want) / 2));
    chosen.push(...run.seats.slice(start, start + want).map((seat) => seat.label));
    blocks += 1;
  }

  return { seats: chosen, together: false, blocks };
}

/**
 * Is this seat one a buyer on this tier is allowed to hold?
 *
 * The check exists because a seat label arrives from a browser. Without it a £20 buyer
 * types "A1" and sits in the £200 section — the tier count would still be right, so
 * nothing would look wrong until somebody with a front-row ticket found it occupied.
 */
export function seatBelongsToTier(
  sections: SeatingSection[],
  tierId: string,
  seat: string
): boolean {
  const label = seat.trim().toUpperCase();

  return sections.some((section) => {
    if (section.tierId !== tierId) return false;

    const blocked = new Set(
      [...(section.unavailableSeats ?? []), ...(section.accessibleSeats ?? [])].map((s) =>
        s.toUpperCase()
      )
    );
    if (blocked.has(label)) return false;

    return sectionSeats(section).some((s) => s.label === label);
  });
}

/* -------------------------------------------------------------------------- */
/* Geometry — docs/23 §5, phase 1                                             */
/* -------------------------------------------------------------------------- */

/**
 * A seat with a place in the room, in venue-space units.
 *
 * Geometry is **derived, never stored**. The seat's identity is still its label — F12 is
 * F12 whether the row is straight or an arc — so a section changing shape moves dots on
 * a screen and does not touch holds, locks, tickets or anything else that spends money.
 * That is also why this lives beside `sectionSeats` rather than in a component: the
 * picker, the builder preview and anything later (a printed map, a door screen) must
 * draw the same room from the same function or they will disagree about where F12 is.
 */
export interface PositionedSeat extends Seat {
  /** Venue-space units. One seat is SEAT_PITCH wide; the drawing scales, the units do not. */
  x: number;
  y: number;
  /** Degrees. On curved shapes the seat turns to face the stage. */
  rotation: number;
}

/** Distance between seat centres along a row, and between rows. Venue units. */
export const SEAT_PITCH = 22;
export const ROW_PITCH = 28;
/** A gangway is wider than a seat gap — it is a walkway, not a missing chair. */
const AISLE_GAP = SEAT_PITCH * 0.9;

const DEFAULT_SWEEP: Record<string, number> = { curve: 40, arc: 90 };

/**
 * Where every seat in a section sits.
 *
 * Straight is the exact layout the old flex rendering produced, expressed as
 * coordinates. Curve and arc are concentric circles about a centre behind the stage:
 * seats keep a constant *arc length* spacing of one seat pitch, so back rows are
 * naturally longer than front rows — which is what a real raked room does, and why an
 * arc drawn by scaling a rectangle always looks wrong. Angled shears the block into a
 * diagonal; vertical turns it on its side for a side balcony or a coach.
 */
export function seatPositions(section: SeatingSection): PositionedSeat[] {
  const seats = sectionSeats(section);
  const shape = section.shape ?? 'straight';

  if (shape === 'curve' || shape === 'arc') {
    const sweepDegrees = Math.min(180, Math.max(10, section.curveDegrees ?? DEFAULT_SWEEP[shape]));
    const rows = sectionRows(section);
    const widest = Math.max(1, ...rows.map((row) => row.seats));
    /*
     * The front row's radius is chosen so the widest row fits inside the sweep at one
     * seat pitch of arc length per seat. Too small a radius with too many seats would
     * wrap a row past the sweep; deriving it from the widest row means the organiser
     * chooses an angle and the room simply fits.
     */
    const sweep = (sweepDegrees * Math.PI) / 180;
    const baseRadius = Math.max((widest * SEAT_PITCH) / sweep, 3 * ROW_PITCH);

    return seats.map((seat) => {
      const radius = baseRadius + seat.rowIndex * ROW_PITCH;
      const row = rows[seat.rowIndex];
      const rowSeats = Math.max(1, row?.seats ?? 1);
      /*
       * Arc length from the row's centre line, in seats. `index` counts existing seats
       * from the left; aisles add walkway width exactly as they do in a straight row.
       */
      const aisles = (row?.aisleAfter ?? []).filter((n) => n < (row?.from ?? 1) + seat.index).length;
      const along =
        (seat.index - (rowSeats - 1) / 2 + (seat.offset ?? 0) / 2) * SEAT_PITCH + aisles * AISLE_GAP;
      const theta = along / radius; // radians from the centre line

      return {
        ...seat,
        x: Math.round(radius * Math.sin(theta) * 100) / 100,
        // y grows towards the back of the room; the arc bows towards the stage.
        y: Math.round((radius - radius * Math.cos(theta) + seat.rowIndex * ROW_PITCH) * 100) / 100,
        rotation: Math.round(((theta * 180) / Math.PI) * 10) / 10,
      };
    });
  }

  return seats.map((seat) => {
    const row = sectionRows(section)[seat.rowIndex];
    const aisles = (row?.aisleAfter ?? []).filter((n) => n < (row?.from ?? 1) + seat.index).length;
    const along = (seat.index + (seat.offset ?? 0) / 2) * SEAT_PITCH + aisles * AISLE_GAP;
    const deep = seat.rowIndex * ROW_PITCH;

    switch (shape) {
      case 'vertical':
        // Rows run top to bottom — a side balcony, a bus, a boat.
        return { ...seat, x: deep, y: along, rotation: 0 };
      case 'angled':
        // The block shears one half-pitch per row — a diagonal wing.
        return { ...seat, x: along + deep * 0.75, y: deep, rotation: 0 };
      default:
        return { ...seat, x: along, y: deep, rotation: 0 };
    }
  });
}

/** The box the drawing needs, with a margin for the seat glyphs themselves. */
export function sectionBounds(positioned: PositionedSeat[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  if (positioned.length === 0) return { minX: 0, minY: 0, width: SEAT_PITCH, height: ROW_PITCH };
  const xs = positioned.map((seat) => seat.x);
  const ys = positioned.map((seat) => seat.y);
  const pad = SEAT_PITCH;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    minX,
    minY,
    width: Math.max(...xs) + pad - minX,
    height: Math.max(...ys) + pad - minY,
  };
}

/**
 * The single empty seats a proposed selection would strand — docs/23 §10.
 *
 * A seat is stranded when it is free and both neighbours in its run are not, where a
 * run ends at a gangway or the end of the row: nobody buys the one seat between two
 * strangers, so every stranded single is a seat the organiser probably never sells.
 *
 * Only *newly* stranded seats are reported. A room can already contain singles — from
 * earlier sales, or because the organiser turned this rule on late — and refusing a
 * buyer over an orphan they did not create punishes the wrong person.
 *
 * `bestAvailable` treats stranding as a score penalty, because an assistant should
 * prefer tidy and accept untidy. This is the other posture — a rule the organiser can
 * switch on (`preventOrphans` on the section), enforced at hold time — and the two
 * deliberately share nothing but this file, so a picker and a policy cannot drift.
 */
export function orphansCreated(
  section: SeatingSection,
  taken: Set<string>,
  chosen: string[]
): string[] {
  const chosenSet = new Set(chosen.map((seat) => seat.trim().toUpperCase()));

  const stranded = (unavailable: Set<string>): Set<string> => {
    const found = new Set<string>();
    const rows = new Map<string, Seat[]>();
    for (const seat of sectionSeats(section)) {
      if (!rows.has(seat.row)) rows.set(seat.row, []);
      rows.get(seat.row)!.push(seat);
    }

    for (const row of rows.values()) {
      // Split the row into runs at gangways, then look for free singletons.
      let run: Seat[] = [];
      const flush = () => {
        for (let i = 0; i < run.length; i += 1) {
          const seat = run[i];
          if (unavailable.has(seat.label)) continue;
          const leftFree = i > 0 && !unavailable.has(run[i - 1].label);
          const rightFree = i < run.length - 1 && !unavailable.has(run[i + 1].label);
          if (!leftFree && !rightFree) found.add(seat.label);
        }
        run = [];
      };
      for (const seat of row) {
        run.push(seat);
        if (seat.aisleAfter) flush();
      }
      flush();
    }
    return found;
  };

  const before = stranded(taken);
  const after = stranded(new Set([...taken, ...chosenSet]));

  return [...after].filter((label) => !before.has(label) && !chosenSet.has(label)).sort();
}

/**
 * "B12-B15, C4 C6" → ["B12","B13","B14","B15","C4","C6"] — docs/25 §43.
 *
 * The production-kill panel takes seat lists the way a stage manager writes them:
 * ranges within a row, separated however. A range only expands when both ends share
 * the same row prefix and the numbers run forward; anything else passes through
 * verbatim and is caught later by "that seat does not exist", which is a better error
 * than silently guessing what B12-C4 meant.
 */
export function expandSeatList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.trim().toUpperCase();
    if (!token) continue;

    const range = token.match(/^([A-Z]+)(\d+)-([A-Z]*)(\d+)$/);
    if (range) {
      const [, rowA, fromStr, rowB, toStr] = range;
      const from = Number(fromStr);
      const to = Number(toStr);
      if ((rowB === '' || rowB === rowA) && to >= from && to - from <= 200) {
        for (let n = from; n <= to; n += 1) out.push(`${rowA}${n}`);
        continue;
      }
    }
    out.push(token);
  }
  return [...new Set(out)];
}
