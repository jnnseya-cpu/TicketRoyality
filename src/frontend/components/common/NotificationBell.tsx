'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';
import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useAuth } from '@/frontend/hooks/use-auth';
import { db, isFirebaseConfigured } from '@/shared/firebase/client';
import { cn } from '@/shared/utils';

/**
 * The notification bell.
 *
 * Subscribed to Firestore rather than polled, so a refund confirmation or an organiser
 * approval appears without the user reloading — and without a request every few seconds
 * from every open tab, which is what polling costs at any real number of users.
 *
 * The query is scoped to the signed-in user and `firestore.rules` enforces the same
 * scope, so the subscription cannot be widened by editing the client.
 *
 * Renders nothing at all when signed out. A bell that shows zero to a visitor is a
 * control that does nothing, in the busiest part of the page.
 */

interface Notification {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  actionLabel?: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string;
}

const SEVERITY_DOT: Record<Notification['severity'], string> = {
  info: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-primary',
  critical: 'bg-destructive',
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<Notification[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!user || !isFirebaseConfigured) {
      setItems([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      fsLimit(20)
    );

    // A failed subscription leaves the bell empty rather than throwing. A notification
    // list is not worth breaking the header over.
    const stop = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Notification)),
      () => setItems([])
    );

    return stop;
  }, [user]);

  const unread = items.filter((n) => !n.readAt);

  const markAll = async () => {
    setBusy(true);
    try {
      await authedFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } finally {
      setBusy(false);
    }
  };

  const open = async (n: Notification) => {
    if (n.readAt) return;
    await authedFetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    }).catch(() => undefined);
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void markAll()} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Mark all read
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Ticket confirmations, refunds and account updates appear here.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const content = (
                <div className="flex gap-2.5">
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      n.readAt ? 'bg-transparent' : SEVERITY_DOT[n.severity]
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );

              return (
                <li key={n.id} className="border-b border-border/60 last:border-0">
                  {n.actionUrl ? (
                    <Link
                      href={n.actionUrl}
                      onClick={() => void open(n)}
                      className="block px-3 py-2.5 transition-colors hover:bg-secondary"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {items.length > 0 && (
          <div className="border-t border-border px-3 py-1.5 text-center">
            <Badge variant="secondary" className="text-[11px]">
              Showing the {items.length} most recent
            </Badge>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
