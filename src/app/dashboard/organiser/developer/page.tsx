'use client';

import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { DeveloperPanel } from '@/frontend/components/dashboard/DeveloperPanel';

/**
 * Developer settings: API keys and webhook endpoints.
 *
 * Behind a signed-in session rather than the API itself, because a key that can mint more
 * keys is a key whose theft is unrecoverable.
 */
export default function DeveloperPage() {
  return (
    <RequireRole role="organiser">
      {() => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">Developers</h1>
            <p className="text-sm text-muted-foreground">
              Read your events and tickets from your own systems, and get told when things
              happen. Start with a test key — it reads sandbox data and touches nothing real.
            </p>
          </div>

          <DeveloperPanel />
        </div>
      )}
    </RequireRole>
  );
}
