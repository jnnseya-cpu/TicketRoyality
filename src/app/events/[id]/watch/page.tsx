'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, LockKeyhole, Radio, Send } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { useAuth } from '@/frontend/hooks/use-auth';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { db, isFirebaseConfigured } from '@/shared/firebase/client';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: string;
  hidden?: boolean;
}

interface Access {
  streamUrl: string;
  chatEnabled: boolean;
  isReplay: boolean;
  name: string;
}

/**
 * The player, for people who hold a ticket.
 *
 * The embed URL is fetched from a route that checks for a ticket first, so a visitor
 * without one never receives it — there is nothing in this page's source to find. What
 * that does not stop is a holder sharing the link afterwards; the page says so rather than
 * implying a protection that would need a streaming vendor to be real.
 */
export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { user, loading } = useAuth();

  const [access, setAccess] = React.useState<Access | null>(null);
  const [error, setError] = React.useState<{ message: string; opensAt?: string } | null>(null);
  const [checking, setChecking] = React.useState(true);

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    authedFetch(`/api/stream?eventId=${encodeURIComponent(eventId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (response.ok) setAccess(data as Access);
        else setError({ message: data.error, opensAt: data.opensAt });
      })
      .catch(() => {
        if (!cancelled) setError({ message: 'Could not reach the stream.' });
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, user, loading]);

  /*
   * Chat is subscribed live rather than polled. Messages are written only through the
   * API, which re-checks the ticket — the rules deny every client write, so this
   * subscription is read-only by construction.
   */
  React.useEffect(() => {
    if (!access?.chatEnabled || !isFirebaseConfigured) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'stream_chat'),
        where('eventId', '==', eventId),
        orderBy('at', 'desc'),
        limit(80)
      ),
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))
            .filter((m) => !m.hidden)
            .reverse()
        );
      },
      () => setMessages([])
    );

    return () => unsubscribe();
  }, [access?.chatEnabled, eventId]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const response = await authedFetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', eventId, text: draft }),
      });
      if (response.ok) setDraft('');
    } finally {
      setSending(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-lg py-16">
        <Alert>
          <LockKeyhole />
          <AlertTitle>Sign in to watch</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>The stream is for ticket holders. Sign in with the account you bought with.</p>
            <Button size="sm" asChild>
              <Link href={`/login?next=/events/${eventId}/watch`}>Log in</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="container max-w-lg py-16">
        <Alert variant={error?.opensAt ? 'default' : 'warning'}>
          <AlertCircle />
          <AlertTitle>{error?.opensAt ? 'Not open yet' : 'No access'}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error?.message ?? 'You need a ticket for this event to watch.'}</p>
            {error?.opensAt && (
              <p className="text-sm">
                The player opens at{' '}
                <strong>
                  {new Date(error.opensAt).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </strong>
                .
              </p>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href={`/events/${eventId}`}>Back to the event</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant={access.isReplay ? 'secondary' : 'destructive'} className="gap-1">
          <Radio className="h-3 w-3" /> {access.isReplay ? 'Replay' : 'Live'}
        </Badge>
        <span className="text-sm text-muted-foreground">Watching as {access.name}</span>
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href={`/events/${eventId}`}>Event details</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
            <iframe
              src={access.streamUrl}
              title="Live stream"
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This link is yours. Sharing it lets other people watch without a ticket — we can see
            how many places a ticket opens the stream from, and organisers act on it.
          </p>
        </div>

        {access.chatEnabled && (
          <Card className="flex max-h-[70vh] flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <p className="text-sm font-medium">Live chat</p>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nothing yet. Say hello.
                  </p>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="text-sm">
                      <span className="font-medium text-primary">{message.name}</span>{' '}
                      <span className="text-muted-foreground">{message.text}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={draft}
                  placeholder="Message"
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button size="icon" onClick={send} disabled={sending || !draft.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
