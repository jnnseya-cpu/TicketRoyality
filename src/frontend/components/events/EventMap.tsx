'use client';

import * as React from 'react';
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
 * Venue location, a live map, and directions from wherever the visitor is.
 *
 * Two Google Maps surfaces are in play and the difference matters commercially:
 *
 *   Maps **Embed** API   — the interactive iframe used here. Free, unmetered.
 *   Maps **Static** API  — the flat picture this used to show. Billed per request.
 *
 * So the live map is both better and cheaper than the image it replaces. The embed has
 * two modes and the component switches between them: `place` centres on the venue, and
 * `directions` draws the actual route once a starting point exists — which is the thing
 * a ticket-holder actually wants, rendered on the page rather than behind a link.
 *
 * **Everything except the embedded map works with no API key at all.** The `maps/dir/`
 * deep links are plain URLs — Google resolves the destination and uses the device's own
 * location as the origin, opening the Maps app on a phone. Without a key this degrades
 * to the address panel with every directions control still live, which is the right way
 * round: someone standing outside a venue needs the route, not a picture.
 */

type TravelMode = 'driving' | 'transit' | 'walking';

const MODES: Array<{
  id: TravelMode;
  label: string;
  icon: typeof Car;
  apple: string;
  embed: string;
}> = [
  { id: 'driving', label: 'Drive', icon: Car, apple: 'd', embed: 'driving' },
  { id: 'transit', label: 'Transit', icon: Bus, apple: 'r', embed: 'transit' },
  { id: 'walking', label: 'Walk', icon: Footprints, apple: 'w', embed: 'walking' },
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

  // Coordinates are exact; the address string is what a geocoder has to guess at.
  const destination = coordinates ? `${coordinates.lat},${coordinates.lng}` : location;

  /**
   * The embed URL. `directions` the moment an origin exists, `place` before that.
   *
   * The key is a build-time public value, so it is visible in the page source either
   * way — an HTTP-referrer restriction in the Google Cloud console is what actually
   * protects it, not secrecy.
   */
  const embedUrl = React.useMemo(() => {
    if (!apiKey) return null;
    const modeParam = MODES.find((m) => m.id === mode)?.embed ?? 'driving';

    if (origin) {
      const params = new URLSearchParams({
        key: apiKey,
        origin,
        destination,
        mode: modeParam,
      });
      return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
    }

    const params = new URLSearchParams({ key: apiKey, q: destination, zoom: '14' });
    return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }, [apiKey, origin, destination, mode]);

  const directionsUrl = React.useMemo(() => {
    const params = new URLSearchParams({ api: '1', destination, travelmode: mode });
    // Omitted deliberately when empty: Google then uses the device's current location,
    // which beats anything we could pass and needs no permission prompt from us.
    if (origin) params.set('origin', origin);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [destination, mode, origin]);

  const appleUrl = React.useMemo(() => {
    const flag = MODES.find((m) => m.id === mode)?.apple ?? 'd';
    const params = new URLSearchParams({ daddr: destination, dirflg: flag });
    if (origin) params.set('saddr', origin);
    return `https://maps.apple.com/?${params.toString()}`;
  }, [destination, mode, origin]);

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
        // A refusal is a valid choice, not an error. Directions still work — Google
        // resolves the starting point itself when we send none.
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

  const clearOrigin = React.useCallback(() => {
    setOrigin('');
    setTypedOrigin('');
    setHere(null);
    setNotice(null);
  }, []);

  const copyAddress = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(location);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Could not copy — select the address above instead.');
    }
  }, [location]);

  const milesAway = here && coordinates ? getDistanceInMiles(here, coordinates) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {embedUrl ? (
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={origin ? `Route to ${location}` : `Map showing ${location}`}
          className="aspect-[16/10] w-full border-0 sm:aspect-[2/1]"
          loading="lazy"
          // The map is decorative relative to the address and controls below it, which
          // carry the same information in text. Keeping it out of the tab order stops
          // keyboard users being trapped panning a map they cannot escape.
          tabIndex={-1}
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
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
            {!embedUrl && (
              <p className="text-xs text-muted-foreground">
                Open the route in Google Maps or Apple Maps below.
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
          <div className="flex items-center justify-between">
            <label htmlFor="journey-origin" className="text-xs font-medium text-muted-foreground">
              Starting from
            </label>
            {origin && (
              <button
                type="button"
                onClick={clearOrigin}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>
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
              placeholder={
                here ? 'Using your current location' : 'Your postcode or address (optional)'
              }
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
