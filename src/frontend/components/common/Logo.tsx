import { cn } from '@/shared/utils';

/**
 * TicketRoyality crest: a crowned ticket stub, drawn as fine engraved line — the
 * register of a banknote or a certificate. All stroke, no fill, so it reads as
 * stamped foil at any size and never needs a glow to feel valuable ("The Programme").
 * `currentColor` inherits gold from `text-primary`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('h-7 w-7 text-primary', className)}
    >
      <path
        d="M4 6.5 8.5 11 16 4l7.5 7L28 6.5V13H4V6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M4 15.5h24a2.5 2.5 0 0 0 0 5V26a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5.5a2.5 2.5 0 0 0 0-5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M13 19v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.4 2.6" />
      {/* three engraved points on the crown — the fine detail of a struck seal */}
      <circle cx="8.5" cy="8.4" r="0.7" fill="currentColor" />
      <circle cx="16" cy="6.2" r="0.7" fill="currentColor" />
      <circle cx="23.5" cy="8.4" r="0.7" fill="currentColor" />
    </svg>
  );
}

/**
 * The wordmark, set in the Didone display face: "Ticket" in ink, "Royality" in a
 * curtain-bordeaux italic — a theatre-bill lockup, not a two-tone gold logotype.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-headline text-xl font-semibold tracking-tight', className)}>
      Ticket<span className="italic font-medium text-accent">Royality</span>
    </span>
  );
}
