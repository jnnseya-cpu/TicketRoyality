'use client';

import {
  seatPositions,
  sectionBounds,
  sectionCapacity,
  sectionRows,
  sectionSeats,
} from '@/shared/seating';
import { cn, formatCurrency } from '@/shared/utils';
import type { SeatingSection } from '@/shared/types';

/**
 * Visual venue preview. Each section renders as its individually labelled seats
 * (A1…A20, B1…B20, …) in the section's colour, laid out in front of a stage.
 *
 * The geometry comes from `shared/seating.ts` — the same function the buyer's map and the
 * server's allocator use — so a room with a gangway or rows of different lengths previews
 * as what will actually be sold. Counting `rows × seatsPerRow` here instead would report a
 * capacity the room does not have the moment a section is shaped.
 */
export function SeatMapPreview({
  sections,
  currency = 'GBP',
}: {
  sections: SeatingSection[];
  currency?: string;
}) {
  const totalCapacity = sections.reduce((sum, s) => sum + sectionCapacity(s), 0);

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Add a seating section to preview the venue layout.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-background/40 p-5">
      <div className="mx-auto w-2/3 rounded-md bg-gradient-to-b from-primary/30 to-primary/5 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-primary">
        Stage
      </div>

      {sections.map((section) => {
        const seats = sectionSeats(section);

        /*
         * A shaped section previews from the same geometry the buyer's picker draws
         * (docs/23 §5) — one function for both, or the organiser approves a room the
         * customer never sees.
         */
        if (section.shape && section.shape !== 'straight') {
          const positioned = seatPositions(section);
          const box = sectionBounds(positioned);
          return (
            <div key={section.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: section.color }}
                  aria-hidden
                />
                <span className="font-medium">{section.name}</span>
                <span className="text-muted-foreground">
                  {seats.length} seats · {formatCurrency(section.price, currency)}
                </span>
              </div>
              <div className="overflow-auto rounded-md border border-border/60">
                <svg
                  viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
                  className="w-full"
                  aria-label={`${section.name} layout preview`}
                >
                  {positioned.map((seat) => (
                    <g key={seat.label} transform={`rotate(${seat.rotation} ${seat.x} ${seat.y})`}>
                      <rect
                        x={seat.x - 7}
                        y={seat.y - 7}
                        width={14}
                        height={14}
                        rx={3}
                        fill={section.color}
                        fillOpacity={0.8}
                      >
                        <title>{seat.label}</title>
                      </rect>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          );
        }

        return (
          <div key={section.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: section.color }}
                aria-hidden
              />
              <span className="font-medium">{section.name}</span>
              <span className="text-muted-foreground">
                {seats.length} seats · {formatCurrency(section.price, currency)}
              </span>
            </div>

            <div className="space-y-1 overflow-x-auto">
              {sectionRows(section).map((row) => {
                const rowLetter = row.name.toUpperCase();
                return (
                  <div key={rowLetter} className="flex items-center gap-1">
                    <span className="w-8 shrink-0 truncate text-[10px] font-medium text-muted-foreground">
                      {rowLetter}
                    </span>
                    <div
                      className="flex gap-1"
                      style={{ marginLeft: `${(row.offset ?? 0) * 10}px` }}
                    >
                      {seats
                        .filter((seat) => seat.row === rowLetter)
                        .map((seat) => (
                          <span
                            key={seat.label}
                            title={seat.label}
                            className={cn(
                              'h-4 w-4 rounded-[3px] opacity-80',
                              // A gangway is a gap in the room, so it is a gap here too.
                              seat.aisleAfter && 'mr-4'
                            )}
                            style={{ backgroundColor: section.color }}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="border-t border-border pt-3 text-sm">
        Total capacity: <span className="font-semibold text-primary">{totalCapacity}</span> seats
        across {sections.length} section{sections.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
