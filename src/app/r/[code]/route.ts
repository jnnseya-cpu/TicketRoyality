import { NextResponse } from 'next/server';

import { REF_COOKIE, REF_COOKIE_MAX_AGE, getLink, recordClick } from '@/backend/services/partners';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A tracked link: `/r/PARTNERCODE`.
 *
 * Counts the click, drops a **first-party** cookie, and sends the visitor where they were
 * going. No third-party pixel, no fingerprinting, no cross-site identifier — the cookie
 * says which partner sent this person and nothing else, which is why it needs no consent
 * banner and cannot follow anyone anywhere.
 *
 * ## An unknown code still lands somewhere useful
 *
 * A partner mistyping their own link, or someone sharing it with a character lost in a
 * chat app, should reach the event rather than a 404 with an apology. The click is not
 * counted and no cookie is set; the visitor never learns there was a code at all.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  const link = await getLink(code);

  // Where they are going: the link's own event, an explicit `?to=`, or the catalogue.
  const requested = new URL(request.url).searchParams.get('to');
  const destination =
    requested && requested.startsWith('/')
      ? requested
      : link?.eventId
        ? `/events/${link.eventId}`
        : '/events';

  const response = NextResponse.redirect(`${siteUrl}${destination}`, { status: 302 });

  if (link?.active) {
    // Not awaited before the redirect is built, but awaited before returning: on Cloud
    // Run the instance can be frozen the moment a response goes out, and a floating
    // promise is a click that sometimes counts.
    await recordClick(code);

    response.cookies.set(REF_COOKIE, link.code, {
      maxAge: REF_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: siteUrl.startsWith('https://'),
    });
  }

  return response;
}
