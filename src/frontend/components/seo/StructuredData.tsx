import type { Event } from '@/shared/types';
import { leadPrice } from '@/shared/pricing';
import { SITE_NAME, siteUrl } from '@/shared/site';

/**
 * JSON-LD structured data.
 *
 * Correct `Event` markup is the single highest-leverage SEO item on the platform
 * (docs/04 M25): it puts date, price and availability directly into the search result
 * and qualifies the page for Google's events carousel, which sits above ordinary
 * results.
 *
 * Rendered as a plain <script> in a server component. The payload is JSON.stringify'd
 * with `<` escaped so an event title containing markup cannot break out of the tag.
 */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

const ATTENDANCE_MODE: Record<Event['eventType'], string> = {
  physical: 'https://schema.org/OfflineEventAttendanceMode',
  online: 'https://schema.org/OnlineEventAttendanceMode',
  livestream: 'https://schema.org/OnlineEventAttendanceMode',
};

export function EventStructuredData({ event }: { event: Event }) {
  const base = siteUrl();
  const price = leadPrice(event);

  const location =
    event.eventType === 'physical'
      ? {
          '@type': 'Place',
          name: event.location,
          address: {
            '@type': 'PostalAddress',
            addressLocality: event.location,
            addressCountry: event.country,
          },
          ...(event.coordinates && {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: event.coordinates.lat,
              longitude: event.coordinates.lng,
            },
          }),
        }
      : {
          '@type': 'VirtualLocation',
          url: event.onlineLink ?? `${base}/events/${event.id}`,
        };

  const soldOut = event.ticketTiers.every(
    (tier) => tier.quantity - (tier.sold ?? 0) <= 0
  );

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        description: event.description.slice(0, 500),
        startDate: event.date,
        ...(event.endDate && { endDate: event.endDate }),
        eventAttendanceMode: ATTENDANCE_MODE[event.eventType],
        eventStatus:
          event.status === 'cancelled'
            ? 'https://schema.org/EventCancelled'
            : 'https://schema.org/EventScheduled',
        location,
        ...(event.imageUrl && { image: [event.imageUrl] }),
        organizer: {
          '@type': 'Organization',
          name: event.organizerName,
          url: `${base}/organisers/${event.organizerId}`,
        },
        offers: {
          '@type': 'Offer',
          url: `${base}/events/${event.id}`,
          price: price.toFixed(2),
          priceCurrency: event.currency,
          availability: soldOut
            ? 'https://schema.org/SoldOut'
            : 'https://schema.org/InStock',
          validFrom: event.createdAt,
        },
        ...(event.speakers?.length && {
          performer: event.speakers.map((speaker) => ({
            '@type': 'Person',
            name: speaker.name,
          })),
        }),
      }}
    />
  );
}

/** Structurally typed: every field used here is public, so a projection is enough. */
export function OrganiserStructuredData({
  organiser,
}: {
  organiser: {
    uid: string;
    fullName: string;
    companyName?: string;
    logoUrl?: string;
    bio?: string;
    website?: string;
  };
}) {
  const base = siteUrl();
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: organiser.companyName ?? organiser.fullName,
        url: `${base}/organisers/${organiser.uid}`,
        ...(organiser.logoUrl && { logo: organiser.logoUrl }),
        ...(organiser.bio && { description: organiser.bio.slice(0, 500) }),
        ...(organiser.website && { sameAs: [organiser.website] }),
      }}
    />
  );
}

export function SiteStructuredData() {
  const base = siteUrl();
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: base,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${base}/events?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      }}
    />
  );
}
