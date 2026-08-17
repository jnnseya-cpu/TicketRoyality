'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CreditCard,
  Crown,
  Loader2,
  LogOut,
  Sparkles,
  Ticket as TicketIcon,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Separator } from '@/frontend/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { DeleteAccountDialog } from '@/frontend/components/dashboard/DeleteAccountDialog';
import { ProfileForm } from '@/frontend/components/dashboard/ProfileForm';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { TicketCard } from '@/frontend/components/dashboard/TicketCard';
import { useAuth } from '@/frontend/hooks/use-auth';
import { getUserTickets } from '@/shared/data/repositories';
import { acuToUsd } from '@/shared/constants/billing';
import { formatCurrency } from '@/shared/utils';
import type { Ticket, UserProfile } from '@/shared/types';

function CustomerDashboard({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const { logout, refreshProfile } = useAuth();
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getUserTickets(profile.uid)
      .then((result) => {
        if (!cancelled) setTickets(result);
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  const now = Date.now();
  const upcoming = tickets.filter((t) => new Date(t.eventDate).getTime() >= now);
  const past = tickets.filter((t) => new Date(t.eventDate).getTime() < now);
  const balanceAcu = profile.wallet?.balanceAcu ?? 0;

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold">
            Hello {profile.fullName.split(' ')[0]}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Not {profile.fullName.split(' ')[0]}?{' '}
            <button onClick={handleLogout} className="text-primary hover:underline">
              Log out
            </button>
            . From your dashboard you can view recent orders, manage your billing address, and edit
            your password and account details.
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: TicketIcon, label: 'Upcoming tickets', value: upcoming.length },
          { icon: Sparkles, label: 'Events attended', value: past.length },
          {
            icon: Wallet,
            label: 'AI credit balance',
            value: `${balanceAcu} ACU`,
            sub: `≈ $${acuToUsd(balanceAcu).toFixed(2)}`,
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <stat.icon className="h-6 w-6 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-headline text-xl font-bold">{stat.value}</p>
                {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section id="tickets" className="mb-10">
        <h2 className="mb-4 font-headline text-xl font-semibold">Purchased tickets</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <TicketIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                You have not bought any tickets yet.
              </p>
              <Button variant="royal" asChild>
                <Link href="/events">Find an event</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
                {upcoming.length === 0 && (
                  <p className="text-sm text-muted-foreground">No upcoming events.</p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="past">
              <div className="grid gap-4 md:grid-cols-2">
                {past.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
                {past.length === 0 && (
                  <p className="text-sm text-muted-foreground">No past events yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </section>

      <Separator className="my-10" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>Used on your tickets and billing receipts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} onSaved={() => void refreshProfile()} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" /> Payment methods
              </CardTitle>
              <CardDescription>
                Saved cards used for one-click ticket purchases.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Visa ending 4242</p>
                  <p className="text-xs text-muted-foreground">Expires 04/29 · Default</p>
                </div>
                <Badge variant="secondary">Default</Badge>
              </div>
              <Button variant="outline" className="w-full">
                Add a payment method
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> AI credit wallet
              </CardTitle>
              <CardDescription>
                {balanceAcu} ACU ({formatCurrency(acuToUsd(balanceAcu), 'USD', 'en-US')}) available
                for AI features.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard/customer/wallet">
                  Open wallet <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-primary" /> Table bookings
              </CardTitle>
              <CardDescription>
                Hospitality tables you have reserved, the balance outstanding on each, and your
                guest list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard/customer/bookings">
                  Open bookings <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" /> Become an event organiser
              </CardTitle>
              <CardDescription>
                Organisers sell tickets, run door check-in and manage a full event store from the
                organiser dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="royal" className="w-full" asChild>
                <Link href="/register/organiser">
                  Apply to become an organiser <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>Leaving? You can remove your account at any time.</CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CustomerDashboardPage() {
  return <RequireRole role="customer">{(profile) => <CustomerDashboard profile={profile} />}</RequireRole>;
}
