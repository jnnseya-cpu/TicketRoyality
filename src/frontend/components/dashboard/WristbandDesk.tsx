'use client';

import * as React from 'react';
import { CheckCircle2, Link2, Loader2, Radio, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { authedFetch } from '@/frontend/lib/authed-fetch';

type Outcome =
  | { kind: 'bound'; reference: string; attendee: string }
  | { kind: 'admitted'; reference: string; attendee: string; tierName: string; seat?: string }
  | { kind: 'refused'; error: string; reference?: string }
  | null;

/**
 * The wristband desk.
 *
 * ## Why the tag field is just a text input
 *
 * The readers venues actually buy are keyboard wedges: present a tag and the reader types
 * the UID and presses Enter. So the whole integration is an input with focus and an
 * Enter handler — no driver, no SDK, no vendor. Plugging in a reader and clicking the box
 * is the entire setup, and typing a UID by hand works identically when a reader fails.
 *
 * The field re-focuses itself after every read, because at a door nobody is going to click
 * back into a text box between people.
 */
export function WristbandDesk({ eventId }: { eventId: string }) {
  const [mode, setMode] = React.useState<'admit' | 'bind'>('admit');
  const [tag, setTag] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome>(null);

  const tagRef = React.useRef<HTMLInputElement>(null);
  const refRef = React.useRef<HTMLInputElement>(null);

  // Keep the cursor where the reader types. A door has no spare hands.
  React.useEffect(() => {
    const focus = () => (mode === 'bind' && !reference ? refRef : tagRef).current?.focus();
    focus();
    const timer = window.setInterval(focus, 3000);
    return () => window.clearInterval(timer);
  }, [mode, reference, outcome]);

  const submit = async () => {
    if (!tag.trim()) return;
    setBusy(true);
    try {
      const response = await authedFetch('/api/wristbands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          eventId,
          tagUid: tag,
          ...(mode === 'bind' ? { reference } : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setOutcome({ kind: 'refused', error: data.error ?? 'Refused.', reference: data.reference });
      } else if (mode === 'bind') {
        setOutcome({ kind: 'bound', reference: data.reference, attendee: data.attendee });
        setReference('');
      } else {
        setOutcome({
          kind: 'admitted',
          reference: data.reference,
          attendee: data.attendee,
          tierName: data.tierName,
          seat: data.seat,
        });
      }
    } catch {
      setOutcome({ kind: 'refused', error: 'Could not reach the door.' });
    } finally {
      setTag('');
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" /> Wristbands &amp; tags
        </CardTitle>
        <CardDescription>
          Works with any reader that types a tag and presses Enter — which is nearly all of them.
          Click the box, present a band, done. No driver and no app to install.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'admit' | 'bind')}>
          <TabsList>
            <TabsTrigger value="admit">Admit</TabsTrigger>
            <TabsTrigger value="bind">Issue a band</TabsTrigger>
          </TabsList>

          <TabsContent value="bind" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="band-ref">1 · Ticket reference</Label>
              <Input
                id="band-ref"
                ref={refRef}
                value={reference}
                placeholder="TR-4F2A9C"
                autoComplete="off"
                onChange={(e) => setReference(e.target.value.toUpperCase())}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="band-tag">
            {mode === 'bind' ? '2 · Present the band' : 'Present the band'}
          </Label>
          <Input
            id="band-tag"
            ref={tagRef}
            value={tag}
            placeholder="Tap the tag on the reader"
            autoComplete="off"
            disabled={busy || (mode === 'bind' && !reference.trim())}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        )}

        {outcome?.kind === 'admitted' && (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Admit {outcome.attendee}</AlertTitle>
            <AlertDescription>
              {outcome.tierName}
              {outcome.seat ? ` · Seat ${outcome.seat}` : ''} · {outcome.reference}
            </AlertDescription>
          </Alert>
        )}

        {outcome?.kind === 'bound' && (
          <Alert variant="success">
            <Link2 />
            <AlertTitle>Band issued to {outcome.attendee}</AlertTitle>
            <AlertDescription>
              {outcome.reference} — they can enter on the band from now on.
            </AlertDescription>
          </Alert>
        )}

        {outcome?.kind === 'refused' && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Do not admit</AlertTitle>
            <AlertDescription>
              {outcome.error}
              {outcome.reference ? ` (${outcome.reference})` : ''}
            </AlertDescription>
          </Alert>
        )}

        {/*
          The limit, at the desk where it matters. A band is a bearer token — that is what
          a wristband has always been, and staff already understand it.
        */}
        <p className="text-xs text-muted-foreground">
          A band admits whoever is wearing it. There is no code to check and nothing to
          rotate, so treat a lost band like a lost ticket: release it here and issue another.
        </p>
      </CardContent>
    </Card>
  );
}
