'use client';

import * as React from 'react';
import { KeyRound, Lock } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { BoxOfficeSell } from '@/frontend/components/dashboard/BoxOfficeSell';
import type { TicketTier } from '@/shared/types';

/**
 * The gate-staff box office: enter the per-event PIN once, then sell. The PIN is never
 * trusted here — every sale is re-checked server-side against the stored HMAC — so this
 * gate is only a convenience that keeps the wrong hands out of the form. The PIN lives in
 * memory for the session and is never written to storage.
 */
export function BoxOfficeStaff({
  eventId,
  currency,
  tiers,
}: {
  eventId: string;
  currency: string;
  tiers: TicketTier[];
}) {
  const [pin, setPin] = React.useState('');
  const [entered, setEntered] = React.useState('');

  if (!entered) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.trim().length >= 4) setEntered(pin.trim());
        }}
        className="mx-auto max-w-sm space-y-3 rounded-lg border border-border p-6"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4 text-primary" /> Enter the door PIN
        </div>
        <p className="text-xs text-muted-foreground">
          The organiser set this PIN for this event. Ask them if you don’t have it.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="door-pin">Box-office PIN</Label>
          <Input
            id="door-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
          />
        </div>
        <Button type="submit" className="w-full" disabled={pin.trim().length < 4}>
          <KeyRound className="h-4 w-4" /> Unlock the till
        </Button>
      </form>
    );
  }

  return <BoxOfficeSell eventId={eventId} currency={currency} tiers={tiers} pin={entered} />;
}
