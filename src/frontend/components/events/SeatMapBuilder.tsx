'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { sectionSeats, suggestedRowNames, type SeatRowSpec } from '@/shared/seating';
import { cn } from '@/shared/utils';
import type { SeatingSection } from '@/shared/types';

/**
 * Shaping a room that is not a rectangle.
 *
 * ## What this is, said plainly
 *
 * A row editor with a live preview, where rows are reordered by dragging them. It is not
 * a canvas where individual seats are dragged around a floor plan — and calling it one
 * would be the kind of claim this project has already paid for. What it does cover is
 * what actually differs between real rooms and a grid: rows of different lengths, a
 * gangway partway along a row, a missing seat where a pillar is, numbering that does not
 * start at 1, and a stagger for a curved rake.
 *
 * ## Why rows and not seats
 *
 * Because a seat's identity is its label, and a label is what is printed on a ticket and
 * called out at the door. Positions on a canvas are decoration; the row and the number
 * are the thing being sold. Editing what is sold, and previewing where it sits, keeps
 * those the same object.
 *
 * A section with no shape stays a plain rectangle, exactly as before — the rectangle is
 * the right answer for most rooms and nobody should have to draw one.
 */
export function SeatMapBuilder({
  section,
  value,
  onChange,
}: {
  /** The rectangle fields, used to seed a shape and to preview when there is none. */
  section: Pick<SeatingSection, 'name' | 'color' | 'startRow' | 'rows' | 'seatsPerRow'>;
  value?: SeatRowSpec[];
  onChange: (rows: SeatRowSpec[] | undefined) => void;
}) {
  const [dragging, setDragging] = React.useState<number | null>(null);
  // A fresh `[]` every render would rebuild the preview on every keystroke anywhere in
  // the form, which on a 400-seat room is visible.
  const rows = React.useMemo(() => value ?? [], [value]);

  const preview = React.useMemo(
    () =>
      sectionSeats({
        id: 'preview',
        name: section.name,
        color: section.color,
        price: 0,
        startRow: section.startRow || 'A',
        rows: Math.max(1, Number(section.rows) || 1),
        seatsPerRow: Math.max(1, Number(section.seatsPerRow) || 1),
        ...(rows.length > 0 ? { rowSpec: rows } : {}),
      }),
    [rows, section]
  );

  const update = (index: number, patch: Partial<SeatRowSpec>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  /** Seed the shape from the rectangle, so nobody starts from an empty screen. */
  const shape = () => {
    const count = Math.max(1, Number(section.rows) || 1);
    const seats = Math.max(1, Number(section.seatsPerRow) || 1);
    onChange(suggestedRowNames(section.startRow || 'A', count).map((name) => ({ name, seats })));
  };

  const numbers = (text: string) =>
    text
      .split(/[,\s]+/)
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3">
        <p className="text-xs text-muted-foreground">
          This section is a plain rectangle: {section.rows} rows of {section.seatsPerRow}. That is
          the right shape for most rooms.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={shape}>
          <Plus className="h-3.5 w-3.5" /> Shape this room
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Use it when rows are different lengths, a gangway splits a row, a pillar removes a seat,
          or the numbering does not start at 1.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          {rows.length} row{rows.length === 1 ? '' : 's'} · {preview.length} seats
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(undefined)}
          title="Discard the shape and go back to rows × seats per row"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Plain rectangle
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) move(dragging, index);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
            className={cn(
              'flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-background/50 p-2',
              dragging === index && 'opacity-50'
            )}
          >
            <GripVertical
              className="mb-2 h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
              aria-hidden
            />

            <div className="w-20 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Row
              </Label>
              <Input
                value={row.name}
                onChange={(e) => update(index, { name: e.target.value.toUpperCase() })}
              />
            </div>

            <div className="w-20 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Seats
              </Label>
              <Input
                type="number"
                min={1}
                max={80}
                value={row.seats}
                onChange={(e) => update(index, { seats: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>

            <div className="w-20 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                First no.
              </Label>
              <Input
                type="number"
                min={1}
                value={row.from ?? 1}
                onChange={(e) => update(index, { from: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>

            <div className="w-28 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Aisle after
              </Label>
              <Input
                placeholder="6, 12"
                defaultValue={(row.aisleAfter ?? []).join(', ')}
                onBlur={(e) => update(index, { aisleAfter: numbers(e.target.value) })}
              />
            </div>

            <div className="w-28 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                No seat at
              </Label>
              <Input
                placeholder="7, 8"
                defaultValue={(row.missing ?? []).join(', ')}
                onBlur={(e) => update(index, { missing: numbers(e.target.value) })}
              />
            </div>

            <div className="w-20 space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Indent
              </Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={row.offset ?? 0}
                onChange={(e) => update(index, { offset: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
              {/* Dragging is not available to everyone: the same reorder by keyboard. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
              >
                <ChevronUp className="h-3.5 w-3.5" />
                <span className="sr-only">Move {row.name} towards the front</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(index, index + 1)}
                disabled={index === rows.length - 1}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="sr-only">Move {row.name} towards the back</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Remove row {row.name}</span>
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const last = rows[rows.length - 1];
          const used = new Set(rows.map((r) => r.name));
          const name =
            suggestedRowNames('A', rows.length + 4).find((candidate) => !used.has(candidate)) ??
            `${rows.length + 1}`;
          onChange([...rows, { name, seats: last?.seats ?? 10 }]);
        }}
      >
        <Plus className="h-3.5 w-3.5" /> Add a row
      </Button>

      {/* The preview is the same geometry the buyer's map and the server's allocator use,
          so what is drawn here is what will be sold. */}
      <div className="space-y-1 overflow-x-auto rounded-md bg-muted/30 p-2">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-1">
            <span className="w-10 shrink-0 truncate text-[10px] text-muted-foreground">
              {row.name}
            </span>
            <div className="flex gap-0.5" style={{ marginLeft: `${(row.offset ?? 0) * 8}px` }}>
              {preview
                .filter((seat) => seat.row === row.name.toUpperCase())
                .map((seat) => (
                  <span
                    key={seat.label}
                    title={seat.label}
                    className={cn('h-2.5 w-2.5 rounded-[2px]', seat.aisleAfter && 'mr-3')}
                    style={{ backgroundColor: section.color, opacity: 0.75 }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
