import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OrganiserStructuredData } from '@/frontend/components/seo/StructuredData';
import type { Metadata } from 'next';
import { Globe } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { EventCard } from '@/frontend/components/events/EventCard';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { getPublicOrganiser } from '@/backend/services/public-profiles';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';

/**
 * Per request, not prerendered. Same reason as the directory: the profile is live data
 * read with privileged credentials, and a build-time read has none.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const organiser = await getPublicOrganiser(id);
  if (!organiser) return { title: 'Organiser not found' };
  const name = organiser.companyName ?? organiser.fullName;
  return { title: name, description: organiser.bio?.slice(0, 160) };
}

export default async function OrganiserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // getPublicOrganiser already returns null for anyone who is not an approved
  // organiser, so an unvetted seller never gets a public page.
  const organiser = await getPublicOrganiser(id);
  if (!organiser) notFound();

  const events = await getEventsByOrganizer(id);
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.date).getTime() >= now);
  const past = events.filter((e) => new Date(e.date).getTime() < now);
  const name = organiser.companyName ?? organiser.fullName;

  return (
    <div>
      <OrganiserStructuredData organiser={organiser} />
      <div className="relative h-52 w-full overflow-hidden">
        <Image
          src={organiser.coverUrl || PLACEHOLDER_IMAGES.organiserCover}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-background/30" />
      </div>

      <div className="container -mt-16 pb-16">
        <div className="flex flex-wrap items-end gap-5">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-background bg-muted">
            <Image
              src={organiser.logoUrl || PLACEHOLDER_IMAGES.organiserLogo}
              alt={name}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>

          <div className="flex-1">
            <h1 className="font-headline text-3xl font-bold">{name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="gold">{upcoming.length} upcoming</Badge>
              <Badge variant="secondary">{past.length} past</Badge>
              {/* Unconditional: this page only exists for approved organisers. */}
              <Badge variant="success">Verified</Badge>
            </div>
          </div>

          <div className="flex gap-2">
            {organiser.website && (
              <Button variant="outline" size="sm" asChild>
                <a href={organiser.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-4 w-4" /> Website
                </a>
              </Button>
            )}
            {/* The organiser's email is personal data and this page is indexed —
                  contact goes through the platform, not a published mailbox. */}
          </div>
        </div>

        {organiser.bio && (
          <p className="mt-6 max-w-3xl leading-relaxed text-muted-foreground">{organiser.bio}</p>
        )}

        <section className="mt-12">
          <h2 className="mb-5 font-headline text-xl font-semibold">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing on sale right now.{' '}
              <Link href="/events" className="text-primary hover:underline">
                Browse all events
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-5 font-headline text-xl font-semibold">Past events</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
