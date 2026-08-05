'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, ScanLine, ShieldAlert, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { redeemTicket } from '@/server/database';

type ScanOutcome =
  | { kind: 'valid'; reference: string; attendee: string }
  | { kind: 'already-used'; reference: string; redeemedAt?: string }
  | { kind: 'wrong-event'; reference: string }
  | { kind: 'invalid'; detail: string };

const SCANNER_ELEMENT_ID = 'tr-qr-reader';

/**
 * Door scanner. Bound to exactly one event: a ticket for any other event is
 * rejected, and each ticket can only be accepted once.
 *
 * Rendered structure is identical on the server and the first client paint — only the
 * contents change once camera permission resolves — so it cannot cause a hydration
 * mismatch.
 */
export function TicketScanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [scanning, setScanning] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busyRef = React.useRef(false);

  const handleDecoded = React.useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        // Guard against empty/garbage frames — JSON.parse(undefined) throws.
        if (!raw || !raw.trim()) throw new Error('Empty QR payload');

        const parsed = JSON.parse(raw) as { t?: string; e?: string; r?: string };
        if (!parsed?.t) throw new Error('Not a TicketRoyality ticket');

        if (parsed.e && parsed.e !== eventId) {
          setOutcome({ kind: 'wrong-event', reference: parsed.r ?? parsed.t });
          return;
        }

        const { result, ticket } = await redeemTicket(parsed.t, eventId);
        switch (result) {
          case 'valid':
            setOutcome({
              kind: 'valid',
              reference: ticket?.reference ?? parsed.t,
              attendee: ticket?.attendeeName ?? 'Attendee',
            });
            break;
          case 'already-used':
            setOutcome({
              kind: 'already-used',
              reference: ticket?.reference ?? parsed.t,
              redeemedAt: ticket?.redeemedAt,
            });
            break;
          case 'wrong-event':
            setOutcome({ kind: 'wrong-event', reference: ticket?.reference ?? parsed.t });
            break;
          default:
            setOutcome({ kind: 'invalid', detail: 'Ticket not found or cancelled.' });
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
    [eventId]
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

        {cameraError && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Camera unavailable</AlertTitle>
            <AlertDescription>{cameraError}</AlertDescription>
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
        {outcome?.kind === 'invalid' && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Invalid ticket</AlertTitle>
            <AlertDescription>{outcome.detail}</AlertDescription>
          </Alert>
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
