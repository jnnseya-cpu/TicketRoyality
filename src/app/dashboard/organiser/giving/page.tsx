'use client';

import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { GiftAidClaim } from '@/frontend/components/dashboard/GiftAidClaim';

/**
 * Fundraising, for the organiser.
 *
 * Separate from Revenue on purpose: ticket income and gifts are different money with
 * different rules, and a page that adds them together is the first step towards claiming
 * Gift Aid on a ticket.
 */
export default function GivingPage() {
  return (
    <RequireRole role="organiser">
      {() => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">Donations &amp; Gift Aid</h1>
            <p className="text-sm text-muted-foreground">
              Gifts given alongside ticket sales, and what you can reclaim on them.
            </p>
          </div>

          <GiftAidClaim />
        </div>
      )}
    </RequireRole>
  );
}
