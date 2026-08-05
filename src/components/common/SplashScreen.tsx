'use client';

import * as React from 'react';
import { Logo } from '@/components/common/Logo';

const SESSION_KEY = 'tr:splash-shown';

/**
 * Shown once per browser session. Renders nothing on the server and on the first
 * client paint, so it can never cause a hydration mismatch.
 */
export function SplashScreen() {
  const [visible, setVisible] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (window.sessionStorage.getItem(SESSION_KEY)) return;
    window.sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(true);

    const fade = setTimeout(() => setLeaving(true), 1500);
    const hide = setTimeout(() => setVisible(false), 2100);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-background transition-opacity duration-500 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 grid-backdrop opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--primary)/0.18),transparent_60%)]" />
      <div className="relative flex flex-col items-center gap-4 animate-splash-in">
        <Logo className="h-16 w-16 drop-shadow-[0_0_28px_hsl(var(--primary)/0.6)]" />
        <p className="font-headline text-3xl font-bold tracking-tight">
          Ticket<span className="text-royal">Royality</span>
        </p>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          Where every ticket feels royal
        </p>
      </div>
    </div>
  );
}
