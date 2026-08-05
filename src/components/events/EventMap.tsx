import Image from 'next/image';
import { MapPin } from 'lucide-react';

import type { Coordinates } from '@/shared/types';

interface EventMapProps {
  coordinates?: Coordinates;
  location: string;
}

/**
 * Static Google Map of the venue, wrapped in a link that opens directions.
 * Falls back to a plain address panel when no Maps key is configured.
 */
export function EventMap({ coordinates, location }: EventMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : location;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  if (!apiKey || !coordinates) {
    return (
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
      >
        <MapPin className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">{location}</p>
          <p className="text-xs text-muted-foreground">Open in Google Maps for directions</p>
        </div>
      </a>
    );
  }

  const staticMapUrl =
    `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}` +
    `&zoom=14&size=800x400&scale=2&maptype=roadmap` +
    `&markers=color:0xE0A82E%7C${coordinates.lat},${coordinates.lng}&key=${apiKey}`;

  return (
    <a
      href={directionsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-border"
    >
      <div className="relative aspect-[2/1] bg-muted">
        <Image
          src={staticMapUrl}
          alt={`Map showing ${location}`}
          fill
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="flex items-center gap-2 bg-card p-3 text-sm">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="font-medium">{location}</span>
        <span className="ml-auto text-xs text-muted-foreground group-hover:text-primary">
          Get directions →
        </span>
      </div>
    </a>
  );
}
