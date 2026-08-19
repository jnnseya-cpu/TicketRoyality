'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Loader2,
  Smartphone,
  TicketIcon,
  Users,
} from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { FeaturedPlacements } from '@/frontend/components/dashboard/FeaturedPlacements';
import { PlacementPricing } from '@/frontend/components/dashboard/PlacementPricing';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import {
  getOrganisers,
  getPendingOfflinePayments,
  getPlatformStats,
} from '@/shared/data/repositories';

function AdminOverview() {
  const [stats, setStats] = React.useState({ totalUsers: 0, totalEvents: 0, totalTickets: 0 });
  const [pendingOrganisers, setPendingOrganisers] = React.useState(0);
  const [pendingPayments, setPendingPayments] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getPlatformStats(), getOrganisers('pending'), getPendingOfflinePayments()])
      .then(([platformStats, organisers, payments]) => {
        if (!cancelled) {
          setStats(platformStats);
          setPendingOrganisers(organisers.length);
          setPendingPayments(payments.length);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  const metrics = [
    { icon: Users, label: 'Total users', value: stats.totalUsers },
    { icon: CalendarDays, label: 'Total events', value: stats.totalEvents },
    { icon: TicketIcon, label: 'Tickets issued', value: stats.totalTickets },
  ];

  const actions = [
    {
      icon: BadgeCheck,
      title: 'Organiser approvals',
      count: pendingOrganisers,
      href: '/dashboard/superuser/approvals',
      description: 'Applications waiting on a decision.',
    },
    {
      icon: Smartphone,
      title: 'Offline payments',
      count: pendingPayments,
      href: '/dashboard/superuser/offline-payments',
      description: 'Mobile-money references awaiting verification.',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Everything happening across TicketRoyality, in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <metric.icon className="h-6 w-6 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="truncate font-headline text-xl font-bold">{metric.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {actions.map((action) => (
          <Card key={action.href} className={action.count > 0 ? 'border-primary/40' : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <action.icon className="h-5 w-5 text-primary" /> {action.title}
              </CardTitle>
              <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="font-headline text-2xl font-bold">{action.count}</p>
              <Button variant="outline" size="sm" asChild>
                <Link href={action.href}>
                  Review <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/*
        This section used to be "Revenue streams": ticket count × £2.45, plus two
        formulas inventing placement income from the number of events on the platform.
        None of those figures were earned by anything — the commission is 0 by design,
        and placements were, at the time, free to anyone who ticked a checkbox. An
        administrator making decisions from that screen was being lied to by it.
      */}
      <FeaturedPlacements />

      {/* The owner sets what a placement costs; code carries only the defaults. */}
      <PlacementPricing />
    </div>
  );
}

export default function SuperuserDashboardPage() {
  return <RequireRole role="superuser">{() => <AdminOverview />}</RequireRole>;
}
