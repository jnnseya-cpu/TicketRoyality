'use client';

import * as React from 'react';
import { AlertCircle, Loader2, Wand2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { sectionRows, sectionSeats, type Allocation } from '@/shared/seating';
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
  const [split, setSplit] = React.useState(0);

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

  /**
   * "Just give me the best seats" — which is the request most people actually want to
   * make, and the one a grid of two hundred squares does not answer.
   *
   * The choosing happens on the server against the *current* map. Doing it here from the
   * list this component fetched would confidently recommend a seat that sold two minutes
   * ago, and the buyer would be refused at the till having been told these were the best
   * available. The seats are not reserved by asking — checkout still takes them — so the
   * fresh `taken` list that comes back is applied too.
   */
  const pickBest = async () => {
    setSplit(0);
    try {
      const response = await fetch(
        `/api/events/${eventId}/seats?tierId=${encodeURIComponent(tierId)}&quantity=${quantity}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('unavailable');

      const data = (await response.json()) as { taken?: string[]; suggestion?: Allocation | null };
      setTaken(new Set((data.taken ?? []).map((s) => s.toUpperCase())));

      if (!data.suggestion) {
        // Not enough seats left is a different answer from a bad suggestion, and saying
        // nothing would look like the button was broken.
        setSplit(-1);
        return;
      }

      onChange(data.suggestion.seats);
      if (!data.suggestion.together) setSplit(data.suggestion.blocks);
    } catch {
      setFailed(true);
    }
  };

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
        const unavailable = new Set((section.unavailableSeats ?? []).map((s) => s.toUpperCase()));
        const accessible = new Set((section.accessibleSeats ?? []).map((s) => s.toUpperCase()));

        /*
         * Drawn from the same function the server chooses from, so a room with a gangway,
         * a missing seat or rows of different lengths looks on screen like what is
         * actually sold. A second layout routine here would drift from that one silently.
         */
        const seats = sectionSeats(section);
        const rows = sectionRows(section);

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
              {rows.map((row) => {
                const rowLetter = row.name.toUpperCase();
                return (
                  <div key={rowLetter} className="flex items-center gap-1">
                    <span className="w-8 shrink-0 truncate text-[10px] font-medium text-muted-foreground">
                      {rowLetter}
                    </span>
                    <div
                      className="flex gap-1"
                      // A staggered or curved room is indented row by row, in half-seat
                      // units, so the drawing matches what somebody sees walking in.
                      style={{ marginLeft: `${(row.offset ?? 0) * 10}px` }}
                    >
                      {seats
                        .filter((seat) => seat.row === rowLetter)
                        .map((seat) => {
                          const label = seat.label;
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
                                isMine && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                                // A gangway is a real gap in the room, so it is a real gap
                                // on screen — and it is why the seats either side of it are
                                // not offered to a party as seats together.
                                seat.aisleAfter && 'mr-4'
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <p className="text-xs text-muted-foreground">
          {selected.length === 0
            ? `Choose ${quantity} seat${quantity === 1 ? '' : 's'}, or let us pick.`
            : `${selected.join(', ')} — ${selected.length} of ${quantity} chosen.`}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void pickBest()}>
          <Wand2 className="h-3.5 w-3.5" /> Best available
        </Button>
      </div>

      {split === -1 && (
        <p className="text-xs text-destructive">
          There are not {quantity} seats left in this section. Try fewer, or another ticket type.
        </p>
      )}

      {split > 1 && (
        // Said out loud. Handing back scattered seats and letting somebody discover it on
        // the tickets is the version of this that generates a complaint on the night.
        <p className="text-xs text-amber-600 dark:text-amber-500">
          We could not seat {quantity} of you together — these are {split} separate groups.
          Choose by hand if you would rather sit apart differently.
        </p>
      )}
    </div>
  );
}
