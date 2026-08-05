'use client';

import { CreateEventForm } from '@/components/events/CreateEventForm';
import { RequireRole } from '@/components/dashboard/RequireRole';

export default function NewEventPage() {
  return (
    <RequireRole role="organiser">
      {(profile) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">Create an event</h1>
            <p className="text-sm text-muted-foreground">
              Everything from tiered pricing to a colour-coded seat map, in one form.
            </p>
          </div>
          <CreateEventForm profile={profile} />
        </div>
      )}
    </RequireRole>
  );
}
