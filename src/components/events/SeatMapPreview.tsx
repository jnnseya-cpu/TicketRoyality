'use client';

import { formatCurrency } from '@/lib/utils';
import type { SeatingSection } from '@/shared/types';

/**
 * Visual venue preview. Each section renders as a grid of individually labelled
 * seats (A1…A20, B1…B20, …) in the section's colour, laid out in front of a stage.
 */
export function SeatMapPreview({
  sections,
  currency = 'GBP',
}: {
  sections: SeatingSection[];
  currency?: string;
}) {
  const totalCapacity = sections.reduce((sum, s) => sum + s.rows * s.seatsPerRow, 0);

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
        const startCode = section.startRow.toUpperCase().charCodeAt(0);
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
                {section.rows * section.seatsPerRow} seats ·{' '}
                {formatCurrency(section.price, currency)}
              </span>
            </div>

            <div className="space-y-1 overflow-x-auto">
              {Array.from({ length: section.rows }).map((_, rowIndex) => {
                const rowLetter = String.fromCharCode(startCode + rowIndex);
                return (
                  <div key={rowLetter} className="flex items-center gap-1">
                    <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground">
                      {rowLetter}
                    </span>
                    <div className="flex gap-1">
                      {Array.from({ length: section.seatsPerRow }).map((__, seatIndex) => (
                        <span
                          key={`${rowLetter}${seatIndex + 1}`}
                          title={`${rowLetter}${seatIndex + 1}`}
                          className="h-4 w-4 rounded-[3px] opacity-80"
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
