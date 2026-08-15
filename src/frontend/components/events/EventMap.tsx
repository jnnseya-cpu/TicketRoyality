'use client';

import * as React from 'react';
import Image from 'next/image';
import { Bus, Car, Check, Copy, ExternalLink, Footprints, LocateFixed, MapPin } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { cn, getDistanceInMiles } from '@/shared/utils';
import type { Coordinates } from '@/shared/types';

interface EventMapProps {
  coordinates?: Coordinates;
  location: string;
}

/**
 * Venue location and directions.
 *
 * **None of the directions needs a Maps API key.** The `maps/dir/` deep link is a plain
 * URL: Google resolves the destination and uses the device's own location as the
 * starting point, opening the Maps app on a phone and the web app on a desktop. Only the
 * static map *image* is billed, so without a key this degrades to an address panel with
 * every directions feature still working — which is the right way round, because a
 * ticket-holder standing outside a venue needs directions, not a picture.
 *
 * It previously linked to `maps/search/`, which only drops a pin. That shows people
 * where the venue is and leaves them to start the journey themselves.
 */

type TravelMode = 'driving' | 'transit' | 'walking';

const MODES: Array<{ id: TravelMode; label: string; icon: typeof Car; apple: string }> = [
  { id: 'driving', label: 'Drive', icon: Car, apple: 'd' },
  { id: 'transit', label: 'Transit', icon: Bus, apple: 'r' },
  { id: 'walking', label: 'Walk', icon: Footprints, apple: 'w' },
];

export function EventMap({ coordinates, location }: EventMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [mode, setMode] = React.useState<TravelMode>('driving');
  const [origin, setOrigin] = React.useState('');
  const [typedOrigin, setTypedOrigin] = React.useState('');
  const [locating, setLocating] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [here, setHere] = React.useState<Coordinates | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Coordinates are exact; the address string is what a geocoder has to guess at. Prefer
  // them when the organiser supplied them.
  const destination = coordinates ? `${coordinates.lat},${coordinates.lng}` : location;

  const directionsUrl = React.useMemo(() => {
    const params = new URLSearchParams({ api: '1', destination, travelmode: mode });
    // Omitted deliberately when empty: Google then uses the device's current location,
    // which is more accurate than anything we could pass and needs no permission prompt
    // from us.
    if (origin) params.set('origin', origin);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [destination, mode, origin]);

  const appleUrl = React.useMemo(() => {
    const flag = MODES.find((m) => m.id === mode)?.apple ?? 'd';
    const params = new URLSearchParams({ daddr: destination, dirflg: flag });
    if (origin) params.set('saddr', origin);
    return `https://maps.apple.com/?${params.toString()}`;
  }, [destination, mode, origin]);

  const viewUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;

  /** Only ever on an explicit click — an unprompted permission dialog is a dark pattern. */
  const useMyLocation = React.useCallback(() => {
    if (!('geolocation' in navigator)) {
      setNotice('This browser cannot share a location.');
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setHere(point);
        setOrigin(`${point.lat},${point.lng}`);
        setTypedOrigin('');
        setLocating(false);
      },
      () => {
        // A refusal is a valid choice, not an error. Directions still work — Google just
        // resolves the starting point itself.
        setLocating(false);
        setNotice('Location not shared. Directions will start from wherever you are.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  const applyTypedOrigin = React.useCallback(() => {
    const value = typedOrigin.trim();
    setOrigin(value);
    setHere(null);
    setNotice(value ? null : 'Starting point cleared.');
  }, [typedOrigin]);

  const copyAddress = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(location);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Could not copy — select the address above instead.');
    }
  }, [location]);

  const milesAway =
    here && coordinates ? getDistanceInMiles(here, coordinates) : null;

  const staticMapUrl =
    apiKey && coordinates
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}` +
        `&zoom=14&size=800x400&scale=2&maptype=roadmap` +
        `&markers=color:0xE0A82E%7C${coordinates.lat},${coordinates.lng}&key=${apiKey}`
      : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {staticMapUrl ? (
        <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="block">
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
        </a>
      ) : null}

      <div className="space-y-4 bg-card p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{location}</p>
            {milesAway !== null && (
              <p className="text-xs text-muted-foreground">
                About {milesAway < 10 ? milesAway.toFixed(1) : Math.round(milesAway)} miles
                away in a straight line
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyAddress}
            aria-label="Copy the address"
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Travel mode">
          {MODES.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={mode === option.id ? 'default' : 'outline'}
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="journey-origin" className="text-xs font-medium text-muted-foreground">
            Starting from
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="journey-origin"
              value={typedOrigin}
              onChange={(event) => setTypedOrigin(event.target.value)}
              onBlur={applyTypedOrigin}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyTypedOrigin();
                }
              }}
              placeholder={here ? 'Using your current location' : 'Your postcode or address (optional)'}
              autoComplete="street-address"
            />
            <Button
              type="button"
              variant="outline"
              onClick={useMyLocation}
              disabled={locating}
              className="shrink-0"
            >
              <LocateFixed className={cn('h-4 w-4', locating && 'animate-spin')} />
              {locating ? 'Locating…' : 'Use my location'}
            </Button>
          </div>
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="royal" className="flex-1">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              Get directions
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            {/* iPhones open Google Maps in a browser tab unless the app is installed;
                the Apple Maps link opens natively every time. */}
            <a href={appleUrl} target="_blank" rel="noopener noreferrer">
              Apple Maps
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
