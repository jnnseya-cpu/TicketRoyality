'use client';

import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { cn } from '@/shared/utils';
import type { SeatingSection } from '@/shared/types';

/**
 * Choosing a seat, rather than looking at a picture of one.
 *
 * ## Availability comes from the server, and is never cached
 *
 * `firestore.rules` restricts ticket reads to the buyer, the organiser and
 * administrators, so the browser cannot work out which seats are gone — correctly, since
 * a ticket carries a name and an email. `/api/events/[id]/seats` answers the only
 * question a buyer needs: which labels are taken. Nothing about who is in them is
 * returned, and the response is `no-store`, because a seat map served from a CDN edge is
 * a map of who *was* free and it sends two people at one seat.
 *
 * ## This is a courtesy, not the control
 *
 * A seat greyed out here is a seat somebody else got first, but the browser is not what
 * stops the double sale — the seat lock created inside the checkout hold transaction is,
 * and it refuses the second buyer even if this list was stale when they clicked. So the
 * map is allowed to be a few seconds behind; it is not allowed to be the authority.
 */
export function SeatPicker({
  eventId,
  sections,
  tierId,
  quantity,
  selected,
  onChange,
}: {
  eventId: string;
  sections: SeatingSection[];
  /** Only sections mapped to the tier being bought are selectable. */
  tierId: string;
  quantity: number;
  selected: string[];
  onChange: (seats: string[]) => void;
}) {
  const [taken, setTaken] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events/${eventId}/seats`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('unavailable');
        return response.json();
      })
      .then((data: { taken?: string[] }) => {
        if (!cancelled) {
          setTaken(new Set((data.taken ?? []).map((s) => s.toUpperCase())));
          setFailed(false);
        }
      })
      .catch(() => {
        // Said out loud rather than drawing every seat free, which would invite the buyer
        // to pick one that is already sold and be refused at the till.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const mine = new Set(selected);
  const forThisTier = sections.filter((section) => section.tierId === tierId);

  if (forThisTier.length === 0) return null;

  const toggle = (label: string, state: 'free' | 'taken' | 'held-back') => {
    if (state !== 'free') return;
    if (mine.has(label)) {
      onChange(selected.filter((s) => s !== label));
      return;
    }
    // Choosing more seats than tickets drops the oldest, which is what someone changing
    // their mind means, rather than refusing the click and explaining a rule.
    const next = [...selected, label];
    onChange(next.slice(Math.max(0, next.length - quantity)));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
      <div className="mx-auto w-2/3 rounded-md bg-gradient-to-b from-primary/30 to-primary/5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
        Stage
      </div>

      {failed && (
        <p className="flex items-center gap-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          We could not read which seats are free. You can still choose, and anything already
          sold will be refused before you are charged.
        </p>
      )}

      {loading && (
        <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking which seats are free…
        </p>
      )}

      {forThisTier.map((section) => {
        const startCode = section.startRow.toUpperCase().charCodeAt(0);
        const unavailable = new Set((section.unavailableSeats ?? []).map((s) => s.toUpperCase()));
        const accessible = new Set((section.accessibleSeats ?? []).map((s) => s.toUpperCase()));

        return (
          <div key={section.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: section.color }}
                aria-hidden
              />
              <span className="font-medium">{section.name}</span>
            </div>

            <div className="space-y-1 overflow-x-auto">
              {Array.from({ length: section.rows }).map((_, rowIndex) => {
                const rowLetter = String.fromCharCode(startCode + rowIndex);
                return (
                  <div key={rowLetter} className="flex items-center gap-1">
                    <span className="w-4 shrink-0 text-[10px] font-medium text-muted-foreground">
                      {rowLetter}
                    </span>
                    <div className="flex gap-1">
                      {Array.from({ length: section.seatsPerRow }).map((__, seatIndex) => {
                        const label = `${rowLetter}${seatIndex + 1}`;
                        const isMine = mine.has(label);
                        /*
                         * Three ways a seat is not for sale, kept distinct because they
                         * mean different things to the person asking at the box office:
                         * somebody has it, nobody can use it, or it is being held for a
                         * wheelchair user and is booked by phone.
                         */
                        const state: 'free' | 'taken' | 'held-back' = taken.has(label)
                          ? 'taken'
                          : unavailable.has(label) || accessible.has(label)
                            ? 'held-back'
                            : 'free';

                        return (
                          <button
                            key={label}
                            type="button"
                            title={
                              state === 'taken'
                                ? `${label} — sold`
                                : accessible.has(label)
                                  ? `${label} — accessible seat, booked by phone`
                                  : unavailable.has(label)
                                    ? `${label} — not sold (restricted view)`
                                    : label
                            }
                            aria-label={`Seat ${label}`}
                            aria-pressed={isMine}
                            disabled={state !== 'free'}
                            onClick={() => toggle(label, state)}
                            className={cn(
                              'h-4 w-4 rounded-[3px] transition-transform',
                              state === 'free' && 'hover:scale-125',
                              state === 'taken' && 'cursor-not-allowed bg-muted opacity-40',
                              state === 'held-back' &&
                                'cursor-not-allowed border border-dashed border-muted-foreground/50 bg-transparent',
                              isMine && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                            )}
                            style={
                              state === 'free'
                                ? { backgroundColor: section.color, opacity: isMine ? 1 : 0.8 }
                                : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
        {selected.length === 0
          ? `Choose ${quantity} seat${quantity === 1 ? '' : 's'}.`
          : `${selected.join(', ')} — ${selected.length} of ${quantity} chosen.`}
      </p>
    </div>
  );
}
