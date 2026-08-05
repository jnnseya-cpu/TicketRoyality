import { cn } from '@/shared/utils';

/**
 * TicketRoyality mark: a ticket stub crowned with three points.
 * Uses `currentColor` so it inherits gold in dark mode and ink in light mode.
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
        fill="currentColor"
      />
      <path
        d="M4 15.5h24a2.5 2.5 0 0 0 0 5V26a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5.5a2.5 2.5 0 0 0 0-5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13 19v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1.5 3" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-headline text-lg font-bold tracking-tight', className)}>
      Ticket<span className="text-primary">Royality</span>
    </span>
  );
}
