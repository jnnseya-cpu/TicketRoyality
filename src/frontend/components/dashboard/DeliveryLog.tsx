'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import type { DeliveryStatus } from '@/shared/comms/types';

/**
 * What actually left the building.
 *
 * The catalogue above this says what the platform *can* send. This says what it *did*,
 * which is the only one of the two that answers the support question that matters on a
 * ticketing platform: "I paid and never got anything."
 */

interface Delivery {
  id: string;
  eventKey: string;
  channel: string;
  recipient: string;
  status: DeliveryStatus;
  provider: string;
  at: string;
  error?: string;
  sandbox?: boolean;
}

interface LogResponse {
  records: Delivery[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    byChannel: Record<string, number>;
    failed: number;
  };
}

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'gold' | 'destructive'> = {
  sent: 'success',
  logged: 'secondary',
  queued: 'gold',
  suppressed: 'gold',
  failed: 'destructive',
};

const FILTERS: Array<{ label: string; status?: DeliveryStatus }> = [
  { label: 'All' },
  { label: 'Sent', status: 'sent' },
  { label: 'Failed', status: 'failed' },
  { label: 'Suppressed', status: 'suppressed' },
];

/** `refreshToken` changing forces a refetch — the console bumps it after a test send. */
export function DeliveryLog({ refreshToken = 0 }: { refreshToken?: number }) {
  const [data, setData] = React.useState<LogResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<DeliveryStatus | undefined>(undefined);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      const response = await authedFetch(`/api/comms/deliveries${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load the delivery log.');
      setData(body as LogResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the delivery log.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Delivery log</CardTitle>
            <CardDescription>
              Every message the platform attempted, and what happened to it.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.label}
              size="sm"
              variant={status === filter.status ? 'default' : 'outline'}
              onClick={() => setStatus(filter.status)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {data && data.summary.total > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              {data.summary.total} record{data.summary.total === 1 ? '' : 's'}
            </span>
            {Object.entries(data.summary.byStatus).map(([key, count]) => (
              <span key={key} className="text-muted-foreground">
                <span className="font-semibold text-foreground">{count}</span> {key}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        {loading && !data && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {data && data.records.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            Nothing sent yet. Fire a template below and it will appear here.
          </p>
        )}

        {data && data.records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">When</th>
                  <th className="pb-2 pr-3 font-medium">Event</th>
                  <th className="pb-2 pr-3 font-medium">Channel</th>
                  <th className="pb-2 pr-3 font-medium">Recipient</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={record.id} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(record.at).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{record.eventKey}</td>
                    <td className="py-2 pr-3 font-mono text-xs uppercase">{record.channel}</td>
                    <td className="py-2 pr-3 text-xs">{record.recipient}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={STATUS_VARIANT[record.status] ?? 'secondary'}
                          className="text-[10px]"
                        >
                          {record.status}
                        </Badge>
                        {record.sandbox && (
                          <Badge variant="secondary" className="text-[10px]">
                            sandbox
                          </Badge>
                        )}
                      </div>
                      {record.error && (
                        <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                          {record.error}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
