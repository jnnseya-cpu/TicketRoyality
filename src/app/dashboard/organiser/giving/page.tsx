'use client';

import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { GiftAidClaim } from '@/frontend/components/dashboard/GiftAidClaim';
import { AuctionLotManager } from '@/frontend/components/dashboard/AuctionLotManager';
import { RegistryManager } from '@/frontend/components/dashboard/RegistryManager';

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
      {(profile) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">Donations &amp; Gift Aid</h1>
            <p className="text-sm text-muted-foreground">
              Gifts given alongside ticket sales, what you can reclaim on them, and the auction.
            </p>
          </div>

          <GiftAidClaim />

          <AuctionLotManager organiserId={profile.uid} />

          <RegistryManager organiserId={profile.uid} />
        </div>
      )}
    </RequireRole>
  );
}
