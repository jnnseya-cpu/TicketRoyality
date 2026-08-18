'use client';

import * as React from 'react';
import { Copy, KeyRound, Loader2, Plus, Trash2, Webhook } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';

interface KeyRow {
  id: string;
  name: string;
  mode: 'live' | 'test';
  scopes: string[];
  hint: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  secretHint: string;
}

interface DeliveryRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
}

/**
 * API keys and webhook endpoints.
 *
 * ## The secret appears once and is never shown again
 *
 * Only a hash is stored, so we genuinely cannot show it a second time — which is the
 * point, and is worth saying on screen rather than letting somebody discover it when they
 * come back for it. The alert stays until dismissed rather than being a toast that
 * vanishes while the user is reaching for a password manager.
 */
export function DeveloperPanel() {
  const { toast } = useToast();
  const [keys, setKeys] = React.useState<KeyRow[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointRow[]>([]);
  const [deliveries, setDeliveries] = React.useState<DeliveryRow[]>([]);
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [events, setEvents] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [revealed, setRevealed] = React.useState<{ label: string; secret: string } | null>(null);

  const [keyDraft, setKeyDraft] = React.useState({
    name: '',
    mode: 'test' as 'test' | 'live',
    scopes: ['events:read', 'tickets:read'] as string[],
  });
  const [hookDraft, setHookDraft] = React.useState({ url: '', events: [] as string[] });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/developer');
      const data = await response.json();
      setKeys(data.keys ?? []);
      setEndpoints(data.endpoints ?? []);
      setDeliveries(data.deliveries ?? []);
      setScopes(data.scopes ?? []);
      setEvents(data.events ?? []);
    } catch {
      // The panel simply shows nothing; nothing here is load-bearing for selling tickets.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createKey = async () => {
    const response = await authedFetch('/api/developer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...keyDraft, name: keyDraft.name || 'API key' }),
    });
    const data = (await response.json()) as { secret?: string; error?: string };

    if (!response.ok || !data.secret) {
      toast({ variant: 'destructive', title: 'Key not created', description: data.error });
      return;
    }

    setRevealed({ label: keyDraft.name || 'API key', secret: data.secret });
    setKeyDraft({ ...keyDraft, name: '' });
    await load();
  };

  const createEndpoint = async () => {
    const response = await authedFetch('/api/developer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'endpoint', ...hookDraft }),
    });
    const data = (await response.json()) as { secret?: string; error?: string };

    if (!response.ok || !data.secret) {
      toast({ variant: 'destructive', title: 'Endpoint not added', description: data.error });
      return;
    }

    setRevealed({ label: `Signing secret for ${hookDraft.url}`, secret: data.secret });
    setHookDraft({ url: '', events: [] });
    await load();
  };

  const remove = async (query: string) => {
    await authedFetch(`/api/developer?${query}`, { method: 'DELETE' });
    await load();
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="space-y-6">
      {revealed && (
        <Alert>
          <KeyRound />
          <AlertTitle>Copy this now — it is not shown again</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              {revealed.label}. We store only a hash of it, so we genuinely cannot show it to
              you a second time. Lose it and you create a new one.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-muted px-2 py-1 text-xs">{revealed.secret}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(revealed.secret);
                  toast({ title: 'Copied' });
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                Done
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> API keys
          </CardTitle>
          <CardDescription>
            A <code className="text-xs">tr_test_</code> key reads sandbox data and touches
            nothing real. A <code className="text-xs">tr_live_</code> key reads your own events
            and tickets. They are different keys rather than a setting, so a request cannot
            reach live data by leaving something out.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                className="w-48"
                placeholder="Reporting dashboard"
                value={keyDraft.name}
                onChange={(e) => setKeyDraft({ ...keyDraft, name: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <div className="flex gap-2">
                {(['test', 'live'] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={keyDraft.mode === mode ? 'royal' : 'outline'}
                    onClick={() => setKeyDraft({ ...keyDraft, mode })}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Scopes</Label>
              <div className="flex flex-wrap gap-3">
                {scopes.map((scope) => (
                  <label key={scope} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={keyDraft.scopes.includes(scope)}
                      onCheckedChange={() =>
                        setKeyDraft({ ...keyDraft, scopes: toggle(keyDraft.scopes, scope) })
                      }
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>

            <Button type="button" size="sm" variant="royal" onClick={() => void createKey()}>
              <Plus className="h-4 w-4" /> Create
            </Button>
          </div>

          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge variant={key.mode === 'live' ? 'default' : 'secondary'}>{key.mode}</Badge>
                    {key.revokedAt && <Badge variant="destructive">revoked</Badge>}
                  </span>
                  <code className="text-xs text-muted-foreground">{key.hint}</code>
                  <span className="text-xs text-muted-foreground">
                    {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'never used'}
                  </span>
                  {!key.revokedAt && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove(`keyId=${key.id}`)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-primary" /> Webhooks
          </CardTitle>
          <CardDescription>
            We POST to your https endpoint when something happens, signed with its own secret
            so you can prove it was us. Failures are retried with an increasing delay and stay
            in the log either way.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Endpoint URL</Label>
              <Input
                className="w-72"
                placeholder="https://yourapp.example.com/hooks/ticketroyality"
                value={hookDraft.url}
                onChange={(e) => setHookDraft({ ...hookDraft, url: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Events</Label>
              <div className="flex flex-wrap gap-3">
                {events.map((eventName) => (
                  <label key={eventName} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={hookDraft.events.includes(eventName)}
                      onCheckedChange={() =>
                        setHookDraft({ ...hookDraft, events: toggle(hookDraft.events, eventName) })
                      }
                    />
                    {eventName}
                  </label>
                ))}
              </div>
            </div>

            <Button type="button" size="sm" variant="royal" onClick={() => void createEndpoint()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <span className="break-all font-medium">{endpoint.url}</span>
              <span className="text-xs text-muted-foreground">{endpoint.events.join(', ')}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void remove(`endpointId=${endpoint.id}`)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}

          {deliveries.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Recent deliveries</p>
              {deliveries.slice(0, 15).map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
                >
                  <code>{delivery.type}</code>
                  <span
                    className={
                      delivery.status === 'delivered'
                        ? 'text-success'
                        : delivery.status === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }
                  >
                    {delivery.status}
                    {delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ''}
                    {delivery.attempts > 1 ? ` · ${delivery.attempts} attempts` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(delivery.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
