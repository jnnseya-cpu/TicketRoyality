'use client';

import * as React from 'react';
import {
  CheckCircle2,
  CloudOff,
  Download,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldBan,
  XCircle,
} from 'lucide-react';

import {
  clearQueued,
  deviceId,
  isOfflineSupported,
  loadManifest,
  queueRedemption,
  readQueue,
  saveManifest,
} from '@/frontend/lib/offline-door';
import { decideOffline, type OfflineManifest, type QueuedRedemption } from '@/shared/tickets/offline';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import type { EventSession, VenueZone } from '@/shared/types';
import { cn } from '@/shared/utils';
import { decodeTicketQr } from '@/shared/tickets/qr';

type ScanOutcome =
  | { kind: 'valid'; reference: string; attendee: string }
  | { kind: 'already-used'; reference: string; redeemedAt?: string }
  | { kind: 'wrong-event'; reference: string }
  /* Distinct from `invalid` on purpose. The ticket is genuine, paid and unused — the
     door is refusing the person. Door staff need to see that difference, because the
     conversation that follows is a completely different one. */
  | { kind: 'blocked'; reference: string; reason: string }
  | { kind: 'invalid'; detail: string }
  | {
      kind: 'zone';
      zoneName: string;
      direction: 'in' | 'out';
      occupancy: number;
      capacity: number | null;
    };

const SCANNER_ELEMENT_ID = 'tr-qr-reader';

/**
 * Door scanner. Bound to exactly one event: a ticket for any other event is
 * rejected, and each ticket can only be accepted once.
 *
 * Rendered structure is identical on the server and the first client paint — only the
 * contents change once camera permission resolves — so it cannot cause a hydration
 * mismatch.
 */
export function TicketScanner({
  eventId,
  eventTitle,
  zones = [],
  sessions = [],
}: {
  eventId: string;
  eventTitle: string;
  zones?: VenueZone[];
  sessions?: EventSession[];
}) {
  /*
   * Which door this phone is. Defaults to the main gate — the one that redeems — because
   * that is what most events have, and a scanner that silently defaulted to a zone would
   * let people in without ever using their ticket up.
   */
  const [zoneId, setZoneId] = React.useState('');
  /*
   * Which session this phone is checking into, when it is a workshop door rather than a
   * building door. Mutually exclusive with a zone by construction: choosing one clears
   * the other, because a phone is standing at exactly one kind of door.
   */
  const [sessionId, setSessionId] = React.useState('');
  const [direction, setDirection] = React.useState<'in' | 'out'>('in');

  /*
   * Offline mode. Off unless the organiser downloaded a manifest for this event — a door
   * that silently fell back to a weaker check the moment a network blipped would be a
   * door nobody could reason about.
   */
  const [manifest, setManifest] = React.useState<OfflineManifest | null>(null);
  const [queued, setQueued] = React.useState<QueuedRedemption[]>([]);
  const [downloading, setDownloading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const admittedRef = React.useRef<Set<string>>(new Set());

  const [scanning, setScanning] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busyRef = React.useRef(false);

  const refreshQueue = React.useCallback(async () => {
    if (!isOfflineSupported()) return;
    const entries = await readQueue(eventId);
    setQueued(entries);
    admittedRef.current = new Set(entries.map((e) => e.ticketId));
  }, [eventId]);

  React.useEffect(() => {
    if (!isOfflineSupported()) return;
    void loadManifest(eventId).then(setManifest);
    void refreshQueue();
  }, [eventId, refreshQueue]);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await authedFetch(`/api/tickets/manifest?eventId=${encodeURIComponent(eventId)}`);
      if (!response.ok) throw new Error('Could not download the list.');
      const data = (await response.json()) as OfflineManifest;
      await saveManifest(data);
      setManifest(data);
    } catch {
      setCameraError('Could not download the ticket list. Try again while you have signal.');
    } finally {
      setDownloading(false);
    }
  };

  const sync = React.useCallback(async () => {
    const pending = await readQueue(eventId);
    if (pending.length === 0) return;

    setSyncing(true);
    try {
      const response = await authedFetch('/api/tickets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, queue: pending }),
      });
      if (!response.ok) return;

      const result = (await response.json()) as {
        applied: number;
        conflicts: Array<{ ticketId: string; reference: string }>;
        unknown: string[];
      };

      /*
       * Cleared only for what the server accounted for — applied, conflicting or unknown.
       * Anything it could not process stays queued and goes again, because dropping it
       * would lose the record that somebody was admitted.
       */
      await clearQueued([
        ...pending
          .filter(
            (entry) =>
              !result.conflicts.some((c) => c.ticketId === entry.ticketId) &&
              !result.unknown.includes(entry.ticketId)
          )
          .slice(0, result.applied)
          .map((e) => e.ticketId),
        ...result.conflicts.map((c) => c.ticketId),
        ...result.unknown,
      ]);

      if (result.conflicts.length > 0) {
        setOutcome({
          kind: 'invalid',
          detail: `${result.conflicts.length} ticket${result.conflicts.length === 1 ? ' was' : 's were'} already used elsewhere: ${result.conflicts
            .map((c) => c.reference)
            .join(', ')}. Everything else synced.`,
        });
      }

      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  }, [eventId, refreshQueue]);

  // Drain automatically the moment signal comes back, because door staff will not be
  // watching for a button in the middle of an event.
  React.useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  const handleDecoded = React.useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        // Decoded here only to fail fast on a shop receipt. The server re-decodes the
        // same raw string and makes every decision that matters — this parse is a
        // convenience, never an authorisation.
        const decoded = decodeTicketQr(raw);
        if (!decoded.ok) {
          setOutcome({
            kind: 'invalid',
            detail:
              decoded.reason === 'empty'
                ? 'Nothing scanned.'
                : 'That is not a TicketRoyality ticket.',
          });
          return;
        }

        /*
         * One POST. The signature check, the ownership check, the status check and the
         * write all happen inside one server-side transaction, which is what stops two
         * doors admitting the same ticket at the same moment.
         *
         * If it cannot be reached and a manifest was downloaded, the door falls back to
         * deciding locally — see `shared/tickets/offline.ts` for exactly what that
         * weakens and what it does not.
         */
        let response: Response;
        try {
          response = await authedFetch('/api/tickets/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raw,
              eventId,
              zoneId: zoneId || undefined,
              sessionId: sessionId || undefined,
              direction,
            }),
          });
        } catch {
          if (!manifest) {
            setOutcome({
              kind: 'invalid',
              detail: 'No signal, and no ticket list downloaded for this event.',
            });
            return;
          }

          const decision = await decideOffline(manifest, decoded.payload, admittedRef.current);
          if (!decision.admit) {
            setOutcome({ kind: 'invalid', detail: decision.error });
            return;
          }

          // Written before we say admit. The other order loses admissions on a dropped
          // tab, and a lost admission is a person counted as absent who is in the room.
          const entry: QueuedRedemption = {
            ticketId: decision.ticket.id,
            reference: decision.ticket.reference,
            eventId,
            at: new Date().toISOString(),
            deviceId: deviceId(),
          };
          await queueRedemption(entry);
          admittedRef.current.add(entry.ticketId);
          setQueued((current) => [...current, entry]);

          setOutcome({
            kind: 'valid',
            reference: decision.ticket.reference,
            attendee: decision.ticket.attendeeName,
          });
          return;
        }

        const body = await response.json();

        if (response.ok) {
          // A zone scan reports the room rather than the person: the door staff need to
          // know how full it is, and the ticket has not been used up.
          setOutcome(
            body.zone
              ? {
                  kind: 'zone',
                  zoneName: body.zone.zoneName,
                  direction: body.zone.direction,
                  occupancy: body.zone.occupancy,
                  capacity: body.zone.capacity,
                }
              : {
                  kind: 'valid',
                  reference: body.reference,
                  attendee: body.attendee ?? 'Attendee',
                }
          );
          return;
        }

        switch (body.kind) {
          case 'already-used':
            setOutcome({
              kind: 'already-used',
              reference: body.reference ?? decoded.payload.r,
              redeemedAt: body.redeemedAt,
            });
            break;
          case 'wrong-event':
            setOutcome({ kind: 'wrong-event', reference: body.reference ?? decoded.payload.r });
            break;
          case 'blocked':
            setOutcome({
              kind: 'blocked',
              reference: body.reference ?? decoded.payload.r,
              reason: body.error ?? 'Refused at the door.',
            });
            break;
          default:
            setOutcome({ kind: 'invalid', detail: body.error ?? 'Ticket not found or cancelled.' });
        }
      } catch (error) {
        setOutcome({
          kind: 'invalid',
          detail: error instanceof Error ? error.message : 'Unreadable QR code.',
        });
      } finally {
        // Debounce so one physical ticket does not fire dozens of times.
        setTimeout(() => {
          busyRef.current = false;
        }, 1500);
      }
    },
    // zoneId and direction belong here. Without them the callback captures whichever
    // door was selected when it was created, so switching from the main gate to the VIP
    // lounge mid-event would keep scanning the gate — silently, and only discovered when
    // the occupancy count never moved.
    //
    // `manifest` is here for the same reason and it is the more expensive omission:
    // downloading the ticket list mid-event would leave this callback holding the `null`
    // it captured, so the door would refuse every offline scan while the screen said it
    // was ready. Both are stale-closure bugs the linter catches and a queue does not.
    [eventId, zoneId, sessionId, direction, manifest]
  );

  const start = React.useCallback(async () => {
    setStarting(true);
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => void handleDecoded(decoded),
        () => {
          /* per-frame decode misses are normal; ignore */
        }
      );
      setScanning(true);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? `Camera unavailable: ${error.message}`
          : 'Camera permission was denied.'
      );
    } finally {
      setStarting(false);
    }
  }, [handleDecoded]);

  const stop = React.useCallback(async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* already stopped */
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  React.useEffect(() => {
    return () => {
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" /> Ticket check-in
        </CardTitle>
        <CardDescription>
          Scanning for <span className="font-medium text-foreground">{eventTitle}</span>. Tickets
          for any other event are rejected.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          id={SCANNER_ELEMENT_ID}
          className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border bg-black/40"
        />

        {!scanning && !starting && (
          <p className="text-center text-sm text-muted-foreground">
            Camera is off. Start scanning to check attendees in.
          </p>
        )}

        {zones.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Which door is this phone?
            </p>
            <div className="flex flex-wrap gap-2">
              {/* The main gate is first and selected by default. It is the one that
                  redeems, and a scanner silently defaulting to a zone would let people
                  in without ever using their ticket. */}
              <button
                type="button"
                onClick={() => {
                  setZoneId('');
                  setSessionId('');
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  zoneId === ''
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                Main gate
              </button>
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => {
                    setZoneId(zone.id);
                    setSessionId('');
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    zoneId === zone.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  {zone.name}
                  {zone.capacity !== null && (
                    <span className="ml-1 opacity-70">
                      {zone.occupancy ?? 0}/{zone.capacity}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {zoneId && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Scanning people</span>
                {(['in', 'out'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      direction === d
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {d === 'in' ? 'in' : 'out'}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {zoneId
                ? 'A zone scan checks the ticket may be in this room. It does not use the ticket up.'
                : 'The main gate redeems the ticket. Each ticket can pass it once.'}
            </p>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Or checking into a session?
            </p>
            {/*
              A session scan records attendance and leaves the ticket alone — the
              certificate and the no-show numbers are built from these. Reservation-only
              sessions refuse tickets with no place booked, server-side.
            */}
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    setSessionId(sessionId === session.id ? '' : session.id);
                    setZoneId('');
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    sessionId === session.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  {session.title}
                  {session.capacity != null && (
                    <span className="ml-1 opacity-70">cap {session.capacity}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {cameraError && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Camera unavailable</AlertTitle>
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        )}

        {outcome?.kind === 'zone' && (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>
              {outcome.direction === 'in' ? 'Admit' : 'Exit'} — {outcome.zoneName}
            </AlertTitle>
            <AlertDescription>
              {outcome.capacity === null
                ? `${outcome.occupancy} inside.`
                : `${outcome.occupancy} of ${outcome.capacity} inside.`}{' '}
              The ticket has not been used up.
            </AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'valid' && (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Valid — admit {outcome.attendee}</AlertTitle>
            <AlertDescription>Ticket {outcome.reference} checked in just now.</AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'already-used' && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Already used — do not admit</AlertTitle>
            <AlertDescription>
              Ticket {outcome.reference} was already scanned
              {outcome.redeemedAt ? ` at ${new Date(outcome.redeemedAt).toLocaleTimeString()}` : ''}.
            </AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'wrong-event' && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Wrong event — do not admit</AlertTitle>
            <AlertDescription>
              Ticket {outcome.reference} was issued for a different event.
            </AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'blocked' && (
          <Alert variant="destructive">
            <ShieldBan />
            <AlertTitle>Refused — do not admit</AlertTitle>
            <AlertDescription>
              {outcome.reason} The ticket ({outcome.reference}) is otherwise valid and has not
              been used.
            </AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'invalid' && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Invalid ticket</AlertTitle>
            <AlertDescription>{outcome.detail}</AlertDescription>
          </Alert>
        )}

        {/*
          Offline readiness, stated rather than assumed. Door staff need to know before
          the doors open whether this phone can work without signal — finding out during
          a queue is finding out too late.
        */}
        {isOfflineSupported() && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CloudOff className="h-4 w-4 text-muted-foreground" />
                {manifest ? (
                  <span>
                    Ready to scan without signal —{' '}
                    <span className="font-medium">{manifest.tickets.length}</span> tickets,
                    downloaded{' '}
                    {new Date(manifest.fetchedAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No ticket list downloaded. Without one, no signal means no scanning.
                  </span>
                )}
              </div>

              <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {manifest ? 'Refresh list' : 'Download list'}
              </Button>
            </div>

            {queued.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{queued.length}</span> scan
                  {queued.length === 1 ? '' : 's'} waiting to sync.
                </span>
                <Button variant="ghost" size="sm" onClick={() => void sync()} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync now
                </Button>
              </div>
            )}

            {manifest && (
              <p className="text-xs text-muted-foreground">
                Offline, this device knows what it has admitted but not what another door
                has. Anything admitted twice is reported when the scans sync, with both
                times.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {scanning ? (
            <Button variant="outline" className="flex-1" onClick={() => void stop()}>
              Stop scanning
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => void start()} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Start scanning
            </Button>
          )}
          {outcome && (
            <Button variant="ghost" onClick={() => setOutcome(null)}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
