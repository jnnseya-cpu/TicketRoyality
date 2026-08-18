/**
 * Seating geometry and best-available. `npm run test:seating`
 *
 * Pure: no database, no network. What is asserted is the two things a box office would
 * check by eye — that the map describes the room, and that "best available" seats a party
 * together before it seats them well.
 */
import assert from 'node:assert/strict';

import {
  SEAT_PITCH,
  orphansCreated,
  bestAvailable,
  generatedRowNames,
  seatBelongsToTier,
  seatPositions,
  sectionBounds,
  sectionCapacity,
  sectionSeats,
  suggestedRowNames,
} from './seating';
import type { SeatingSection } from './types';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function section(overrides: Partial<SeatingSection> = {}): SeatingSection {
  return {
    id: 'stalls',
    name: 'Stalls',
    color: '#b8860b',
    price: 30,
    startRow: 'A',
    rows: 3,
    seatsPerRow: 10,
    tierId: 'tier-1',
    ...overrides,
  };
}

console.log('\nSeating\n');

/* -------------------------------------------------------------------- */
/* Row labels                                                           */
/* -------------------------------------------------------------------- */

test('a rectangle still labels rows exactly as it always did', () => {
  /*
   * Including I. A label that shifts turns a sold seat into a free one on the map and an
   * unknown seat at the door, so the reader must keep doing what it did for sections that
   * already exist.
   */
  assert.deepEqual(generatedRowNames('A', 10).join(''), 'ABCDEFGHIJ');
});

test('past Z, rows carry into AA rather than punctuation', () => {
  const names = generatedRowNames('A', 28);
  assert.equal(names[25], 'Z');
  assert.equal(names[26], 'AA');
  assert.equal(names[27], 'AB');
});

test('the builder proposes skipping I and O, because they are read as 1 and 0', () => {
  assert.equal(suggestedRowNames('A', 10).join(''), 'ABCDEFGHJK');
  assert.equal(suggestedRowNames('A', 16).includes('O'), false);
});

/* -------------------------------------------------------------------- */
/* Irregular rooms                                                      */
/* -------------------------------------------------------------------- */

test('a rectangle produces the seats it always did', () => {
  const seats = sectionSeats(section());
  assert.equal(seats.length, 30);
  assert.equal(seats[0].label, 'A1');
  assert.equal(seats.at(-1)?.label, 'C10');
});

test('a curved stalls has rows of different lengths', () => {
  // The shape almost every real room has, and the one a rectangle cannot describe.
  const curved = section({
    rowSpec: [
      { name: 'A', seats: 8 },
      { name: 'B', seats: 10 },
      { name: 'C', seats: 12 },
    ],
  });
  assert.equal(sectionCapacity(curved), 30);
  assert.equal(sectionSeats(curved).filter((s) => s.row === 'C').length, 12);
});

test('a pillar removes a seat without renumbering the ones beside it', () => {
  /*
   * D8 stays D8. Renumbering would move every person already told where they are sitting,
   * to tidy up a hole in a drawing.
   */
  const withPillar = section({ rowSpec: [{ name: 'D', seats: 10, missing: [7] }] });
  const labels = sectionSeats(withPillar).map((s) => s.label);

  assert.equal(labels.includes('D7'), false);
  assert.equal(labels.includes('D8'), true);
  assert.equal(labels.length, 9);
});

test('a row can start at a number other than one', () => {
  const boxes = section({ rowSpec: [{ name: 'BOX', seats: 4, from: 101 }] });
  assert.deepEqual(
    sectionSeats(boxes).map((s) => s.label),
    ['BOX101', 'BOX102', 'BOX103', 'BOX104']
  );
});

/* -------------------------------------------------------------------- */
/* Best available                                                       */
/* -------------------------------------------------------------------- */

test('one seat lands in the middle of the front row', () => {
  const result = bestAvailable([section()], 'tier-1', 1, []);
  assert.ok(result);
  assert.equal(result.together, true);
  // Ten seats: the two middle ones are equally central, and either is the right answer.
  assert.ok(['A5', 'A6'].includes(result.seats[0]), `got ${result.seats[0]}`);
});

test('a party of four sits together', () => {
  const result = bestAvailable([section()], 'tier-1', 4, []);
  assert.ok(result);
  assert.equal(result.together, true);
  assert.equal(result.blocks, 1);

  const numbers = result.seats.map((s) => Number(s.slice(1)));
  assert.equal(new Set(result.seats.map((s) => s[0])).size, 1, 'one row');
  assert.deepEqual(numbers, [numbers[0], numbers[0] + 1, numbers[0] + 2, numbers[0] + 3]);
});

test('together beats comfortable: a full front row sends the party back', () => {
  // Four singles left in row A would score beautifully one at a time. Splitting a party
  // to use them is the wrong answer, and this is the assertion that says so.
  const taken = ['A1', 'A3', 'A5', 'A7', 'A9'];
  const result = bestAvailable([section()], 'tier-1', 4, taken);

  assert.ok(result);
  assert.equal(result.together, true);
  assert.notEqual(result.seats[0][0], 'A');
});

test('a gangway is not a seat away — the run stops at the aisle', () => {
  const split = section({
    rows: 1,
    rowSpec: [{ name: 'F', seats: 12, aisleAfter: [6] }],
  });

  const result = bestAvailable([split], 'tier-1', 4, []);
  assert.ok(result);
  assert.equal(result.together, true);

  // Every chosen seat must be on one side of the gangway.
  const numbers = result.seats.map((s) => Number(s.slice(1)));
  const sides = new Set(numbers.map((n) => (n <= 6 ? 'left' : 'right')));
  assert.equal(sides.size, 1, `party straddled the aisle: ${result.seats.join(', ')}`);
});

test('a party too big for any single run is split, and told so', () => {
  const tight = section({ rows: 2, seatsPerRow: 4 });
  const result = bestAvailable([tight], 'tier-1', 6, []);

  assert.ok(result);
  assert.equal(result.together, false);
  assert.equal(result.blocks, 2);
  assert.equal(result.seats.length, 6);
});

test('not enough seats is a different answer from a split', () => {
  // Dressing "sold out" up as a split hands back four seats when six were asked for.
  const tiny = section({ rows: 1, seatsPerRow: 4 });
  assert.equal(bestAvailable([tiny], 'tier-1', 6, []), null);
});

test('accessible seats are never handed out by best-available', () => {
  /*
   * They are booked by phone precisely so somebody asks about the need rather than
   * guessing it. Allocating one automatically gives a wheelchair space to whoever clicked.
   */
  const one = section({ rows: 1, seatsPerRow: 3, accessibleSeats: ['A2'] });
  const result = bestAvailable([one], 'tier-1', 3, []);
  assert.equal(result, null);

  const two = bestAvailable([one], 'tier-1', 2, []);
  assert.ok(two);
  assert.equal(two.seats.includes('A2'), false);
});

test('restricted-view seats are not offered either', () => {
  const one = section({ rows: 1, seatsPerRow: 4, unavailableSeats: ['A1', 'A4'] });
  const result = bestAvailable([one], 'tier-1', 2, []);
  assert.ok(result);
  assert.deepEqual(result.seats, ['A2', 'A3']);
});

test('a section belonging to another tier is not raided', () => {
  const stalls = section({ id: 'stalls', tierId: 'tier-1', rows: 1, seatsPerRow: 2 });
  const circle = section({ id: 'circle', tierId: 'tier-2', rows: 1, seatsPerRow: 40 });

  assert.equal(bestAvailable([stalls, circle], 'tier-1', 4, []), null);
});

test('a seat already held is not offered again', () => {
  const one = section({ rows: 1, seatsPerRow: 4 });
  const result = bestAvailable([one], 'tier-1', 2, ['a2']);
  assert.ok(result);
  assert.equal(result.seats.includes('A2'), false);
});

test('a lone seat is left stranded only when nothing better exists', () => {
  /*
   * Row A has five free seats. Taking 2–3 or 3–4 leaves a single seat at one end;
   * taking the pair that leaves 1 and 2 together does not. A seat alone between two
   * parties is the seat that never sells.
   */
  const one = section({ rows: 1, seatsPerRow: 5 });
  const result = bestAvailable([one], 'tier-1', 2, []);
  assert.ok(result);

  const numbers = result.seats.map((s) => Number(s.slice(1))).sort((a, b) => a - b);
  const before = numbers[0] - 1;
  const after = 5 - numbers[1];
  assert.notEqual(before, 1, `stranded seat before ${result.seats.join(', ')}`);
  assert.notEqual(after, 1, `stranded seat after ${result.seats.join(', ')}`);
});

/* -------------------------------------------------------------------- */
/* What a browser is allowed to ask for                                 */
/* -------------------------------------------------------------------- */

test('a seat in another tier’s section is refused', () => {
  // Without this a £20 buyer types A1 and sits in the £200 section, and the tier counts
  // still balance — so nothing looks wrong until the front row is occupied.
  const stalls = section({ id: 'stalls', tierId: 'tier-1', startRow: 'A', rows: 1 });
  const circle = section({ id: 'circle', tierId: 'tier-2', startRow: 'Z', rows: 1 });

  assert.equal(seatBelongsToTier([stalls, circle], 'tier-1', 'A1'), true);
  assert.equal(seatBelongsToTier([stalls, circle], 'tier-1', 'Z1'), false);
});

test('a seat that does not exist is refused', () => {
  assert.equal(seatBelongsToTier([section()], 'tier-1', 'A99'), false);
  assert.equal(seatBelongsToTier([section()], 'tier-1', ''), false);
});

test('a held-back seat cannot be asked for by name', () => {
  const one = section({ accessibleSeats: ['B4'], unavailableSeats: ['C1'] });
  assert.equal(seatBelongsToTier([one], 'tier-1', 'B4'), false);
  assert.equal(seatBelongsToTier([one], 'tier-1', 'C1'), false);
  assert.equal(seatBelongsToTier([one], 'tier-1', ' b3 '), true);
});

/* ----------------------------- geometry (docs/23 §5) ---------------------- */

test('a straight section positions every seat, one pitch apart', () => {
  const positioned = seatPositions(section({ rows: 3, seatsPerRow: 4 }));
  assert.equal(positioned.length, 12);
  const a = positioned.filter((seat) => seat.row === 'A');
  assert.equal(a[1].x - a[0].x, SEAT_PITCH);
  assert.equal(a[0].y, a[3].y);
  assert.ok(positioned.every((seat) => seat.rotation === 0));
});

test('geometry never changes what is sold — same labels whatever the shape', () => {
  const base = section({ rows: 4, seatsPerRow: 10 });
  const flat = seatPositions({ ...base, shape: 'straight' }).map((s) => s.label);
  const arc = seatPositions({ ...base, shape: 'arc' }).map((s) => s.label);
  const angled = seatPositions({ ...base, shape: 'angled' }).map((s) => s.label);
  assert.deepEqual(arc, flat);
  assert.deepEqual(angled, flat);
});

test('an arc bows towards the stage: a row\u2019s ends sit deeper than its centre', () => {
  const positioned = seatPositions(section({ rows: 2, seatsPerRow: 11, shape: 'arc' }));
  const rowA = positioned.filter((seat) => seat.row === 'A');
  const centre = rowA[5];
  const end = rowA[0];
  assert.ok(end.y > centre.y, `end ${end.y} should be deeper than centre ${centre.y}`);
  // And the end seats turn to face the stage.
  assert.ok(Math.abs(end.rotation) > 5);
  assert.equal(Math.round(centre.rotation), 0);
});

test('curved rows keep one seat pitch of arc length between neighbours', () => {
  const positioned = seatPositions(section({ rows: 1, seatsPerRow: 8, shape: 'curve' }));
  for (let i = 1; i < positioned.length; i += 1) {
    const dx = positioned[i].x - positioned[i - 1].x;
    const dy = positioned[i].y - positioned[i - 1].y;
    const gap = Math.hypot(dx, dy);
    // Chord is slightly shorter than arc; it must never bunch up or spread out.
    assert.ok(Math.abs(gap - SEAT_PITCH) < 2, `gap ${gap}`);
  }
});

test('a vertical section runs top to bottom', () => {
  const positioned = seatPositions(section({ rows: 2, seatsPerRow: 5, shape: 'vertical' }));
  const a = positioned.filter((seat) => seat.row === 'A');
  assert.equal(a[0].x, a[4].x);
  assert.ok(a[4].y > a[0].y);
});

test('a gangway is wider than a seat gap, in every shape', () => {
  const withAisle = section({
    rows: 1,
    seatsPerRow: 8,
    rowSpec: [{ name: 'A', seats: 8, aisleAfter: [4] }],
  });
  for (const shape of ['straight', 'arc'] as const) {
    const positioned = seatPositions({ ...withAisle, shape });
    const before = positioned[3];
    const after = positioned[4];
    const gap = Math.hypot(after.x - before.x, after.y - before.y);
    assert.ok(gap > SEAT_PITCH * 1.5, `${shape}: ${gap}`);
  }
});

test('bounds cover every seat with a margin', () => {
  const positioned = seatPositions(section({ rows: 3, seatsPerRow: 6, shape: 'arc' }));
  const box = sectionBounds(positioned);
  for (const seat of positioned) {
    assert.ok(seat.x > box.minX && seat.x < box.minX + box.width);
    assert.ok(seat.y > box.minY && seat.y < box.minY + box.height);
  }
});

/* ----------------------------- orphan prevention (§10) -------------------- */

test('choosing the middle of a free run strands nothing at the edges', () => {
  const one = section({ rows: 1, seatsPerRow: 5 });
  // ● X X ● ● — A1 left alone next to the wall? A1's right neighbour A2 is taken,
  // and A1 is at the run edge with no left neighbour: stranded.
  assert.deepEqual(orphansCreated(one, new Set(), ['A2', 'A3']), ['A1']);
});

test('a tidy block strands nobody', () => {
  const one = section({ rows: 1, seatsPerRow: 5 });
  assert.deepEqual(orphansCreated(one, new Set(), ['A1', 'A2']), []);
});

test('an already-stranded single is not blamed on the new buyer', () => {
  const one = section({ rows: 1, seatsPerRow: 5 });
  // A2 taken long ago strands A1. The new buyer takes A4+A5, stranding only A3.
  assert.deepEqual(orphansCreated(one, new Set(['A2']), ['A4', 'A5']), ['A3']);
});

test('a gangway ends the run — a single across the aisle is not stranded', () => {
  const one = section({
    rows: 1,
    seatsPerRow: 6,
    rowSpec: [{ name: 'A', seats: 6, aisleAfter: [3] }],
  });
  // Taking A4 A5 A6 leaves A1–A3 whole; taking A1 A2 strands A3 against the aisle.
  assert.deepEqual(orphansCreated(one, new Set(), ['A4', 'A5', 'A6']), []);
  assert.deepEqual(orphansCreated(one, new Set(), ['A1', 'A2']), ['A3']);
});
console.log(`\n${passed}/${passed + failures.length} passed\n`);
if (failures.length > 0) process.exit(1);
