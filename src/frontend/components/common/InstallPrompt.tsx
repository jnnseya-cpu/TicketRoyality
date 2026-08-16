'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';

/**
 * The install invitation.
 *
 * Shown once, dismissible, and never again for ninety days after a dismissal — a
 * banner that reappears on every visit is the reason install prompts are hated, and a
 * person who said no twice is not going to say yes on the sixth ask.
 *
 * It also waits for a real `beforeinstallprompt` event rather than guessing. That event
 * only fires when the browser has decided the app is actually installable, so nothing
 * appears on a browser that cannot install, in an app that is already installed, or on
 * iOS — where there is no such API and Safari's own Share → Add to Home Screen is the
 * only route.
 */

const DISMISSED_KEY = 'tr:install-dismissed';
const QUIET_DAYS = 90;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    // Already installed: `display-mode: standalone` means we are running inside the
    // installed app, where an install banner is nonsense.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < QUIET_DAYS * 86_400_000) return;

    const onPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented, and two prompts
      // for one action is worse than none.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event can only be used once, whichever way it went.
    setDeferred(null);
  };

  if (!deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Install TicketRoyality"
      className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <Download className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install TicketRoyality</p>
        <p className="text-xs text-muted-foreground">
          Full-screen tickets at the door, and they open without signal.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
