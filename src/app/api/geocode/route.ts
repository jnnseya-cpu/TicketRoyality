import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Turns a venue and country into coordinates.
 *
 * The event form asked organisers to type a latitude and a longitude by hand. Almost
 * nobody knows those, so in practice the fields were left empty and the event shipped
 * with no map and no distance search — the two things the coordinates exist to power.
 *
 * ## Why this is a server route
 *
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is restricted to HTTP referrers, which is correct:
 * it is in the page source, and an unrestricted key is anyone's to spend. Referrer
 * restrictions cover the Maps JavaScript, Embed and Static APIs — they do **not** work
 * for the Geocoding web service, which is a server-to-server call with no referrer. So
 * geocoding needs its own key, held server-side and never sent to the browser.
 *
 * `GOOGLE_MAPS_SERVER_KEY` should be restricted in the console to the Geocoding API and
 * nothing else. If it is absent this route says so plainly rather than falling back to
 * the browser key, which would fail with an opaque `REQUEST_DENIED` that looks like a
 * bug in this code.
 *
 * ## Why it is behind requireUser
 *
 * Geocoding is metered and billed to this project. An open endpoint is somebody else's
 * free geocoding service at your expense, so a caller has to be signed in — the same
 * reasoning that put `requireAdmin` in front of `/api/comms/test`.
 */

interface GeocodeResult {
  lat: number;
  lng: number;
  formatted: string;
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Address lookup is not configured. Set GOOGLE_MAPS_SERVER_KEY to a Google Cloud key restricted to the Geocoding API.',
      },
      { status: 503 }
    );
  }

  let body: { address?: unknown; country?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';

  if (address.length < 3) {
    return NextResponse.json({ ok: false, error: 'Enter the venue first.' }, { status: 400 });
  }

  // The country is appended rather than sent as a `components` filter because the form
  // stores country names ("Congo (Kinshasa)"), not the ISO codes that filter requires.
  // As free text it still disambiguates a venue name that exists in several countries.
  const query = country ? `${address}, ${country}` : address;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', key);

  try {
    const response = await fetch(url, {
      // Never cached: a wrong pin persisting is worse than a second lookup.
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: 'The address service could not be reached.' },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    if (data.status === 'ZERO_RESULTS') {
      return NextResponse.json({ ok: true, found: false });
    }

    if (data.status !== 'OK') {
      // REQUEST_DENIED here almost always means the key is restricted to referrers, or
      // the Geocoding API is not enabled on the project. Logged in full; the caller gets
      // the status, which is enough to act on without exposing the key's configuration.
      reportError(new Error(`Geocoding returned ${data.status}: ${data.error_message ?? ''}`), {
        scope: 'geocode',
        status: data.status,
      });
      return NextResponse.json(
        { ok: false, error: `Address lookup failed (${data.status}).` },
        { status: 502 }
      );
    }

    const best = data.results?.[0];
    const lat = best?.geometry?.location?.lat;
    const lng = best?.geometry?.location?.lng;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ ok: true, found: false });
    }

    const result: GeocodeResult = {
      lat,
      lng,
      formatted: best?.formatted_address ?? query,
    };

    return NextResponse.json({ ok: true, found: true, ...result });
  } catch (error) {
    reportError(error, { scope: 'geocode' });
    return NextResponse.json(
      { ok: false, error: 'The address service did not respond.' },
      { status: 502 }
    );
  }
}
