import { CoverArt } from '@/frontend/components/brand/CoverArt';
import { publishedTestimonials } from '@/shared/content/testimonials';

/**
 * The testimonials band.
 *
 * Renders real, consented quotes from `shared/content/testimonials.ts` — and renders
 * absolutely nothing while that file is empty. No skeleton, no "reviews coming soon", no
 * heading floating above a blank row. A section that appears only once it can be true is
 * the honest way to carry social proof on a young platform: the day a real organiser
 * agrees to be quoted, they show up here; until then the page simply does not make the
 * claim.
 *
 * Server component: the data is static and typed, so there is nothing to fetch and no
 * reason to ship it as client JS.
 */
export function Testimonials() {
  const quotes = publishedTestimonials();
  if (quotes.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-card/30 py-16">
      <div className="container">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            In their words
          </p>
          <h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">
            Organisers who’ve run the night on us
          </h2>
        </div>

        <div className="grid gap-x-14 gap-y-2 sm:grid-cols-2">
          {quotes.map((t, i) => (
            <figure
              key={`${t.author}-${i}`}
              className="flex flex-col border-t border-border/60 py-8 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
            >
              <blockquote className="font-headline text-lg leading-snug sm:text-xl">
                <span className="text-primary">“</span>
                {t.quote}
                <span className="text-primary">”</span>
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3">
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full gold-ring">
                  {t.avatarUrl ? (
                    // A real photo when one was supplied.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.avatarUrl}
                      alt={t.author}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    // The house foil monogram of their name — a design mark, not a stock face.
                    <CoverArt
                      seed={t.author}
                      aspect={1}
                      frame={false}
                      className="absolute inset-0"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{t.author}</span>
                  <span className="block truncate font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t.role} · {t.org}
                    {t.eventName ? ` · ${t.eventName}` : ''}
                  </span>
                </span>
                {t.orgLogoUrl && (
                  // A real organisation logo, when supplied.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.orgLogoUrl}
                    alt={t.org}
                    className="ml-auto h-6 w-auto shrink-0 opacity-80"
                  />
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
