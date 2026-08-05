'use client';

import * as React from 'react';

import { Card, CardContent } from '@/frontend/components/ui/card';

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function remainingUntil(target: number): Remaining | null {
  const diff = target - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/**
 * Live countdown. The first render is a fixed skeleton on both server and client;
 * the real values only appear after mount, so the clock can never cause a mismatch.
 */
export function EventCountdown({ date }: { date: string }) {
  const target = React.useMemo(() => new Date(date).getTime(), [date]);
  const [mounted, setMounted] = React.useState(false);
  const [remaining, setRemaining] = React.useState<Remaining | null>(null);

  React.useEffect(() => {
    setMounted(true);
    setRemaining(remainingUntil(target));
    const interval = setInterval(() => setRemaining(remainingUntil(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  const units: Array<[string, number | null]> = [
    ['Days', remaining?.days ?? null],
    ['Hours', remaining?.hours ?? null],
    ['Minutes', remaining?.minutes ?? null],
    ['Seconds', remaining?.seconds ?? null],
  ];

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="p-5">
        {mounted && !remaining ? (
          <p className="text-center text-sm font-medium">
            This event has already started — check the organiser page for the next date.
          </p>
        ) : (
          <>
            <p className="mb-3 text-center text-xs uppercase tracking-[0.25em] text-primary">
              Doors open in
            </p>
            <div className="grid grid-cols-4 gap-2">
              {units.map(([label, value]) => (
                <div key={label} className="rounded-md border border-border/70 bg-background/60 py-3 text-center">
                  <p className="font-headline text-2xl font-bold tabular-nums">
                    {value === null ? '––' : String(value).padStart(2, '0')}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
