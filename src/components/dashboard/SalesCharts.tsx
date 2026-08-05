'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Ticket } from '@/shared/types';

interface Point {
  label: string;
  revenue: number;
  orders: number;
}

/** Buckets real ticket sales into the last 14 days / 8 weeks. */
function bucket(tickets: Ticket[], granularity: 'day' | 'week'): Point[] {
  const buckets = new Map<string, Point>();
  const periods = granularity === 'day' ? 14 : 8;
  const msPerPeriod = granularity === 'day' ? 86_400_000 : 604_800_000;
  const now = Date.now();

  for (let i = periods - 1; i >= 0; i -= 1) {
    const date = new Date(now - i * msPerPeriod);
    const label =
      granularity === 'day'
        ? `${date.getDate()}/${date.getMonth() + 1}`
        : `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleString('en', { month: 'short' })}`;
    buckets.set(label, { label, revenue: 0, orders: 0 });
  }

  for (const ticket of tickets) {
    const purchased = new Date(ticket.purchasedAt);
    const age = now - purchased.getTime();
    if (age > periods * msPerPeriod) continue;
    const label =
      granularity === 'day'
        ? `${purchased.getDate()}/${purchased.getMonth() + 1}`
        : `W${Math.ceil(purchased.getDate() / 7)} ${purchased.toLocaleString('en', { month: 'short' })}`;
    const entry = buckets.get(label);
    if (entry) {
      entry.revenue += ticket.price;
      entry.orders += 1;
    }
  }

  return [...buckets.values()];
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesCharts({ tickets }: { tickets: Ticket[] }) {
  const [granularity, setGranularity] = React.useState<'day' | 'week'>('day');
  const data = React.useMemo(() => bucket(tickets, granularity), [tickets, granularity]);
  const empty = data.every((point) => point.orders === 0);

  const axisProps = {
    stroke: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  } as const;

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="space-y-4">
      <Tabs value={granularity} onValueChange={(v) => setGranularity(v as 'day' | 'week')}>
        <TabsList>
          <TabsTrigger value="day">By day</TabsTrigger>
          <TabsTrigger value="week">By week</TabsTrigger>
        </TabsList>

        <TabsContent value={granularity}>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartFrame
              title="Net sales"
              description={empty ? 'No sales in this period yet.' : 'Revenue after refunds.'}
            >
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={44} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartFrame>

            <ChartFrame
              title="Orders"
              description={empty ? 'No orders in this period yet.' : 'Completed ticket orders.'}
            >
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={30} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
