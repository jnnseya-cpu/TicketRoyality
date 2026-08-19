import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Globe } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { getPublicOrganisers } from '@/backend/services/public-profiles';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';

/**
 * Rendered per request, not at build time.
 *
 * The directory is live data behind privileged credentials. Prerendering it during
 * `next build` meant querying Firestore with no credentials at all, which the rules
 * correctly denied — and a denied read there fails the entire deploy rather than one
 * page.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Event organisers',
  description: 'Promoters, venues and production companies selling on TicketRoyality.',
};

export default async function OrganisersPage() {
  const organisers = await getPublicOrganisers();

  return (
    <div className="container py-12">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">Event organisers</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The promoters, venues and production companies running events on TicketRoyality.
        </p>
      </div>

      {organisers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm text-muted-foreground">No approved organisers yet.</p>
            <Button variant="royal" asChild>
              <Link href="/register/organiser">Become the first</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {organisers.map((organiser) => (
            <Card key={organiser.uid} className="overflow-hidden transition-colors hover:border-primary/40">
              <div className="relative h-28 bg-muted">
                {/* Plain img: organiser-controlled URLs crash next/image server-side
                    on empty strings and unknown hosts — see the profile page. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={organiser.coverUrl?.trim() || PLACEHOLDER_IMAGES.organiserCover}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
              </div>

              <CardContent className="-mt-8 space-y-3 p-5">
                <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-card bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={organiser.logoUrl?.trim() || PLACEHOLDER_IMAGES.organiserLogo}
                    alt={organiser.companyName ?? organiser.fullName}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>

                <div>
                  <h2 className="font-headline text-base font-semibold">
                    {organiser.companyName ?? organiser.fullName}
                  </h2>
                  {organiser.bio && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {organiser.bio}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  {organiser.website ? (
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="h-3 w-3" /> Website
                    </Badge>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/organisers/${organiser.uid}`}>
                      View events <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
