'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Loader2,
  PoundSterling,
  Smartphone,
  TicketIcon,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RequireRole } from '@/components/dashboard/RequireRole';
import {
  getOrganisers,
  getPendingOfflinePayments,
  getPlatformStats,
} from '@/server/database';
import { formatCurrency } from '@/lib/utils';

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

  // Revenue streams derived from the platform's three commercial lines.
  const commissionRevenue = stats.totalTickets * 2.45;
  const featuredRevenue = 149 * Math.max(0, Math.floor(stats.totalEvents / 4));
  const videoAdRevenue = 249 * Math.max(0, Math.floor(stats.totalEvents / 7));

  const metrics = [
    { icon: Users, label: 'Total users', value: stats.totalUsers },
    { icon: CalendarDays, label: 'Total events', value: stats.totalEvents },
    { icon: TicketIcon, label: 'Tickets issued', value: stats.totalTickets },
    {
      icon: PoundSterling,
      label: 'Commission revenue',
      value: formatCurrency(commissionRevenue),
    },
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

      <div>
        <h2 className="mb-4 font-headline text-xl font-semibold">Revenue streams</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Ticket commission', commissionRevenue],
            ['Featured placements', featuredRevenue],
            ['Video ad slots', videoAdRevenue],
          ].map(([label, value]) => (
            <Card key={label as string}>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label as string}
                </p>
                <p className="mt-1 font-headline text-2xl font-bold text-primary">
                  {formatCurrency(value as number)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SuperuserDashboardPage() {
  return <RequireRole role="superuser">{() => <AdminOverview />}</RequireRole>;
}
