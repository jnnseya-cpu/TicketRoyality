'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { CreateEventForm } from '@/frontend/components/events/CreateEventForm';
import { DynamicSellingPanel } from '@/frontend/components/events/DynamicSellingPanel';
import { CancelEvent } from '@/frontend/components/dashboard/CancelEvent';
import { ProductionKillPanel } from '@/frontend/components/dashboard/ProductionKillPanel';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { ShareLink } from '@/frontend/components/common/ShareLink';
import { getEventById } from '@/shared/data/repositories';
import type { Event } from '@/shared/types';

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = React.useState<Event | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getEventById(params.id)
      .then((result) => {
        if (!cancelled) setEvent(result);
      })
      .catch(() => {
        if (!cancelled) setEvent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <RequireRole role="organiser">
      {(profile) => {
        if (loading) {
          return (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }
        if (!event) {
          return (
            <Alert variant="destructive">
              <AlertTitle>Event not found</AlertTitle>
              <AlertDescription>
                This event may have been deleted, or the link is wrong.
              </AlertDescription>
            </Alert>
          );
        }
        if (event.organizerId !== profile.uid) {
          return (
            <Alert variant="warning">
              <AlertTitle>Not your event</AlertTitle>
              <AlertDescription>You can only edit events you created.</AlertDescription>
            </Alert>
          );
        }

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-headline text-2xl font-bold">Edit event</h1>
                <p className="text-sm text-muted-foreground">{event.title}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* A private event is only reachable by its link, so the link needs a
                    handle; the check-in link is what gate staff's phones scan with. */}
                <ShareLink
                  path={`/events/${event.id}`}
                  label={event.listing === 'unlisted' ? 'Share private link' : 'Share event'}
                  title={event.title}
                />
                <ShareLink
                  path={`/events/${event.id}/check-in`}
                  label="Share check-in link"
                  title={`Check-in portal — ${event.title}`}
                />
              </div>
            </div>
            {/* Above the form: it reads the tiers the form edits, so a stale suggestion
                sitting under an unsaved change would be the confusing order. */}
            <DynamicSellingPanel event={event} />
            {(event.seating ?? []).length > 0 && <ProductionKillPanel eventId={event.id} />}
            <CreateEventForm profile={profile} existingEvent={event} />
            <CancelEvent event={event} />
          </div>
        );
      }}
    </RequireRole>
  );
}
