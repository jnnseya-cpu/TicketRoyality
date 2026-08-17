'use client';

import * as React from 'react';

import { prewarm, withAttestation } from '@/frontend/lib/attest';

/**
 * Signal collection for the sign-up humanity gate (docs/11).
 *
 * Everything gathered here is a hint, and every hint is scored on the server. Nothing
 * in this file decides anything — a client that judged its own humanity would always
 * acquit itself.
 */

export interface HumanitySignals {
  fillMillis: number;
  humanInteraction: boolean;
  honeypot: string;
}

export function useHumanityGate() {
  // Set once at mount rather than on first render, so a re-render never restarts the
  // clock and makes a slow human look instantaneous.
  const mountedAt = React.useRef(Date.now());
  const interacted = React.useRef(false);
  const honeypot = React.useRef('');

  /*
   * Start the proof-of-work as soon as the form exists, so the couple of hundred
   * milliseconds are spent while somebody types their email rather than after they press
   * the button. An attestation that adds a visible pause to a sign-up is one that gets
   * removed for hurting conversion, and then it protects nothing.
   */
  React.useEffect(() => {
    prewarm();
  }, []);

  const markInteraction = React.useCallback(() => {
    interacted.current = true;
  }, []);

  const collect = React.useCallback(
    (): HumanitySignals => ({
      fillMillis: Date.now() - mountedAt.current,
      humanInteraction: interacted.current,
      honeypot: honeypot.current,
    }),
    []
  );

  /**
   * Spread onto the <form>. Capture-phase listeners so a keystroke anywhere inside
   * counts, including in fields that stop propagation.
   */
  const formProps = {
    onKeyDownCapture: markInteraction,
    onPointerDownCapture: markInteraction,
    onFocusCapture: markInteraction,
  };

  const setHoneypot = React.useCallback((value: string) => {
    honeypot.current = value;
  }, []);

  return { collect, formProps, setHoneypot };
}

/**
 * The honeypot.
 *
 * A field a person never sees and never fills, which form-filling automation
 * completes because it reads the DOM rather than the screen.
 *
 * Hidden with an off-screen position rather than `display: none` or `type="hidden"`:
 * the crude bots skip both of those, so hiding it the obvious way defeats the point.
 * `aria-hidden` and `tabIndex={-1}` keep it away from screen readers and the tab
 * order, so it stays invisible to people using assistive technology too — a honeypot
 * that traps blind users is a bug, not a defence.
 */
export function Honeypot({ onChange }: { onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="tr-hp">Leave this field empty</label>
      <input
        id="tr-hp"
        /*
         * The name matters more than it looks.
         *
         * This was `company_website_url`, chosen to tempt a form-filling bot — and
         * `organization` and `url` are precisely the tokens Chrome's address autofill
         * matches on, so filling the visible address fields filled this hidden one too.
         * A real person with autofill on scored an instant refusal, which is the exact
         * failure this gate is supposed to avoid.
         *
         * A meaningless name is invisible to autofill heuristics and just as visible to
         * a bot reading the DOM, which is the only reader it needs to attract.
         */
        name="tr_hp"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        // Belt and braces: some password managers ignore autoComplete but honour this.
        data-1p-ignore
        data-lpignore="true"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Calls the server gate. Never throws — a gate outage must not block real sign-ups. */
export async function checkHumanity(
  email: string,
  signals: HumanitySignals
): Promise<{ allowed: boolean; message?: string }> {
  try {
    const response = await fetch('/api/signup-gate', {
      method: 'POST',
      // The proof-of-work token, when one is ready. Solved in the background while the
      // form was being filled in, so it adds nothing to the wait here.
      headers: await withAttestation({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, ...signals }),
    });

    if (!response.ok) return { allowed: true };
    return (await response.json()) as { allowed: boolean; message?: string };
  } catch {
    // Fail open, deliberately. The cost of a wrong refusal is a real customer who
    // cannot create an account and will not try twice; the cost of a wrong allow is
    // one spam account an admin can suspend.
    return { allowed: true };
  }
}
