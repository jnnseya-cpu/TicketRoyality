/**
 * Real testimonials, and only real ones.
 *
 * This file is wired into the homepage: whatever is in `TESTIMONIALS` renders, and an
 * empty array renders **nothing at all** — no heading, no placeholder card, no "coming
 * soon". That is deliberate and it is the whole point (CLAUDE.md §6). A fabricated
 * quote, a stock face, or a made-up company name on a page that also carries FAQ and
 * Organization structured data is the single most expensive kind of lie a ticketing
 * platform can tell, because search engines quote it back to people as fact.
 *
 * ## The bar for adding an entry
 *
 * Every field below must be true and attributable. Add an entry only when:
 *
 * 1. A real person said it (or wrote it), about their real experience of the platform.
 * 2. They have agreed to be quoted publicly, by name and role — `consent: true` records
 *    that this happened. No `consent`, no render.
 * 3. `author`, `role` and `org` name a real person and organisation. If they asked to
 *    stay anonymous, the honest move is to leave them out, not to invent a name.
 *
 * A photo is optional: with no `avatarUrl` the card shows the house foil monogram of
 * their name, which is a design choice, not a fake face. A logo (`orgLogoUrl`) is the
 * same — optional, real, or absent.
 *
 * ## The shape, by example (kept commented so it renders nothing)
 *
 *   {
 *     quote: 'We moved 1,200 tickets in a weekend and the door never queued once, even
 *             when the venue Wi-Fi died at 9pm.',
 *     author: 'Amina Okoro',
 *     role: 'Promoter',
 *     org: 'Lagos Nights',
 *     eventName: 'Afrobeat Live',
 *     avatarUrl: undefined,   // optional real photo
 *     orgLogoUrl: undefined,  // optional real logo
 *     date: '2026-09-01',
 *     consent: true,
 *   },
 */

export interface Testimonial {
  /** Their words, verbatim. Trim to the strongest sentence or two; never paraphrase. */
  quote: string;
  /** Real full name of the person quoted. */
  author: string;
  /** Their role — "Promoter", "Venue manager", "Festival director". */
  role: string;
  /** Their real organisation or event brand. */
  org: string;
  /** Optional: the specific event this is about. */
  eventName?: string;
  /** Optional real photo URL. Absent → the house monogram, never a stock face. */
  avatarUrl?: string;
  /** Optional real organisation logo URL. */
  orgLogoUrl?: string;
  /** ISO date the quote was given, for ordering and honesty about recency. */
  date?: string;
  /**
   * Records that the person agreed to be quoted publicly by name. An entry without
   * `consent: true` is dropped by the renderer — a hard gate, not a convention.
   */
  consent: boolean;
}

/**
 * Empty until there are real, consented quotes. Do not seed this with examples,
 * "representative" quotes, or anything a real customer did not actually say.
 */
export const TESTIMONIALS: Testimonial[] = [];

/** The renderable set: consented only, newest first. The homepage section hides itself when this is empty. */
export function publishedTestimonials(): Testimonial[] {
  return TESTIMONIALS.filter((t) => t.consent).sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '')
  );
}
