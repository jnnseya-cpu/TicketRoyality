'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, LockKeyhole, UtensilsCrossed } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { BookingCard } from '@/frontend/components/dashboard/BookingCard';
import { useAuth } from '@/frontend/hooks/use-auth';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import type { HospitalityBooking } from '@/shared/types';

/**
 * The buyer's table bookings.
 *
 * Not role-gated: an organiser who books a table at somebody else's event is a customer
 * for that transaction, and locking them out of their own booking to enforce a tidy
 * dashboard hierarchy would be the product getting in the way of the purchase.
 */
export default function BookingsPage() {
  const { user, loading } = useAuth();
  const [bookings, setBookings] = React.useState<HospitalityBooking[]>([]);
  const [fetching, setFetching] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      const response = await authedFetch('/api/hospitality');
      const data = (await response.json()) as { bookings?: HospitalityBooking[] };
      setBookings(data.bookings ?? []);
    } catch {
      setBookings([]);
    } finally {
      setFetching(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (!loading && user) void load();
    if (!loading && !user) setFetching(false);
  }, [loading, user, load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-lg py-16">
        <Alert>
          <LockKeyhole />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Your table bookings are tied to your account.</p>
            <Button size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold">Table bookings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Hospitality tables you have reserved, what is still owed on them, and who is sitting
          where. Tickets are issued once a table is paid in full.
        </p>
      </div>

      {fetching ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <UtensilsCrossed className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You have not booked a table yet.</p>
            <Button variant="royal" asChild>
              <Link href="/events">Find an event</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onChanged={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
