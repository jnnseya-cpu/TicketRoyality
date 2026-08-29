'use client';

import * as React from 'react';
import { Grid3x3, Info, RotateCcw } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { SEAT_PITCH, seatPositions, sectionBounds } from '@/shared/seating';
import { cn } from '@/shared/utils';
import type { SeatingSection } from '@/shared/types';

type Coords = Record<string, { x: number; y: number }>;

/**
 * The floor-plan canvas — drag individual seats where they actually sit.
 *
 * A companion to the row builder, not a replacement: the row builder decides **what seats
 * exist** (labels, lengths, gangways, a removed pillar seat), and this decides **where they
 * sit** on the plan. It writes `section.seatCoords` (label → x/y in venue units), which is
 * pure geometry — a seat's label is its identity, and nothing about holds, checkout,
 * issuance or the door changes because a seat moved. Seats without a saved position fall
 * back to the auto-layout, so a room can be part-arranged and still draws. "Reset" clears
 * every position and returns the section to its automatic shape.
 *
 * The drawing is an SVG in venue units; pointer coordinates are mapped back through the
 * SVG's own transform, so drag lands true at any zoom or screen size, mouse or touch.
 */
export function SeatMapCanvas({
  section,
  onChange,
}: {
  section: SeatingSection;
  onChange: (coords: Coords | undefined) => void;
}) {
  const [coords, setCoords] = React.useState<Coords>(section.seatCoords ?? {});
  const [snap, setSnap] = React.useState(true);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  // Positions with the live drag applied, so the seat follows the finger before saving.
  const positioned = React.useMemo(
    () => seatPositions({ ...section, seatCoords: coords }),
    [section, coords]
  );
  const bounds = React.useMemo(() => sectionBounds(positioned), [positioned]);
  const pad = SEAT_PITCH * 1.5;
  const view = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;

  const commit = (next: Coords) => {
    setCoords(next);
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  /** Map a pointer event to venue-space units through the SVG's current transform. */
  const toVenue = (e: React.PointerEvent | { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const g = SEAT_PITCH / 2;
    return snap
      ? { x: Math.round(local.x / g) * g, y: Math.round(local.y / g) * g }
      : { x: Math.round(local.x * 10) / 10, y: Math.round(local.y * 10) / 10 };
  };

  const startDrag = (label: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(label);
    setSelected(label);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const p = toVenue(e);
    if (p) setCoords((c) => ({ ...c, [dragging]: p }));
  };

  const endDrag = () => {
    if (dragging) commit(coords);
    setDragging(null);
  };

  // Keyboard nudge for the selected seat — a canvas that only works by drag is unusable
  // for anyone who cannot drag precisely.
  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    const here = positioned.find((s) => s.label === selected);
    if (!here) return;
    const step = SEAT_PITCH / 2;
    commit({ ...coords, [selected]: { x: here.x + dx * step, y: here.y + dy * step } });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={snap ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSnap((s) => !s)}
        >
          <Grid3x3 className="h-4 w-4" /> Snap to grid
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(null);
            commit({});
          }}
          disabled={Object.keys(coords).length === 0}
        >
          <RotateCcw className="h-4 w-4" /> Reset to auto layout
        </Button>
        <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> Drag a seat, or select one and nudge with the arrow keys.
        </p>
      </div>

      <div
        className="overflow-auto rounded-md border border-border bg-card/40"
        style={{ maxHeight: 420 }}
      >
        <svg
          ref={svgRef}
          viewBox={view}
          className="h-auto w-full touch-none select-none"
          style={{ minHeight: 240 }}
          role="group"
          aria-label={`Floor plan for ${section.name}`}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onKeyDown={(e) => {
            const map: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const d = map[e.key];
            if (d) {
              e.preventDefault();
              nudge(d[0], d[1]);
            }
          }}
        >
          {/* Stage marker, so the organiser knows which way the room faces. */}
          <rect
            x={bounds.minX - pad / 2}
            y={bounds.minY - pad}
            width={bounds.width + pad}
            height={SEAT_PITCH * 0.5}
            rx={2}
            className="fill-muted"
          />
          <text
            x={bounds.minX + bounds.width / 2}
            y={bounds.minY - pad + SEAT_PITCH * 0.38}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: SEAT_PITCH * 0.35 }}
          >
            STAGE / FRONT
          </text>

          {positioned.map((seat) => {
            const isSel = selected === seat.label;
            const moved = Boolean(coords[seat.label]);
            return (
              <g
                key={seat.label}
                transform={`translate(${seat.x} ${seat.y})`}
                tabIndex={0}
                role="button"
                aria-label={`Seat ${seat.label}${moved ? ', placed' : ''}`}
                className="cursor-grab focus:outline-none"
                onPointerDown={startDrag(seat.label)}
                onFocus={() => setSelected(seat.label)}
                onClick={() => setSelected(seat.label)}
              >
                <circle
                  r={SEAT_PITCH * 0.42}
                  fill={section.color || '#b8860b'}
                  className={cn(
                    'transition-opacity',
                    dragging === seat.label ? 'opacity-100' : moved ? 'opacity-95' : 'opacity-70'
                  )}
                  stroke={isSel ? 'currentColor' : 'none'}
                  strokeWidth={isSel ? 1.5 : 0}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none fill-background font-semibold"
                  style={{ fontSize: SEAT_PITCH * 0.3 }}
                >
                  {seat.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        {Object.keys(coords).length === 0
          ? 'Every seat is in its automatic position. Drag one to start arranging.'
          : `${Object.keys(coords).length} seat${Object.keys(coords).length === 1 ? '' : 's'} placed by hand · the rest follow the auto layout.`}
      </p>
    </div>
  );
}
