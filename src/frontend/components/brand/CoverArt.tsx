import { coverArtSvg, type CoverArtOptions } from '@/shared/brand/cover-art';
import { cn } from '@/shared/utils';

/**
 * The house cover, rendered inline as vector — sharp at any size, no network, no
 * layout flicker. Use this in JSX where a designed backdrop or fallback belongs (a
 * hero, a showcase with no paid placement, an empty-state panel). For a string `src`
 * — a plain <img>, a CSS background — use `coverArtDataUri` from `shared/brand`.
 *
 * The SVG is built as a deterministic string in `shared` and injected here; it carries
 * no scripts and no external references, so `dangerouslySetInnerHTML` is safe.
 */
export function CoverArt({
  seed,
  className,
  ...opts
}: { seed: string; className?: string } & CoverArtOptions) {
  return (
    <div
      className={cn('h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover', className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: coverArtSvg(seed, opts) }}
    />
  );
}
