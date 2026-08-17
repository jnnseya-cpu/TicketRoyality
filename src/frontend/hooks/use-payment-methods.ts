'use client';

import * as React from 'react';

/**
 * Which payment rails are actually live.
 *
 * Read from `/api/health`, which already reports each dependency's configured state, so
 * a rail appears at checkout the moment its keys exist and disappears the moment they
 * do not — with no code change and nobody having to remember.
 *
 * That matters for BitriPay specifically: its credentials are commented out in
 * `apphosting.yaml` until it goes live, and until then the button offered a payment
 * method that could only ever fail. Offering a control that cannot work is the same
 * defect as the "My tickets" link that always returned "wrong account type".
 *
 * Fails closed. If health is unreachable, only the rail that is always present — cards —
 * is offered, because showing a button on a guess is how a buyer ends up in a dead end.
 */

export interface PaymentMethods {
  stripe: boolean;
  bitripay: boolean;
  koda: boolean;
  loading: boolean;
}

interface HealthResponse {
  dependencies?: Array<{ name: string; configured: boolean }>;
}

export function usePaymentMethods(): PaymentMethods {
  const [state, setState] = React.useState<PaymentMethods>({
    stripe: true,
    bitripay: false,
    koda: false,
    loading: true,
  });

  React.useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((body) => {
        if (cancelled) return;
        const configured = (name: string) =>
          body.dependencies?.find((d) => d.name === name)?.configured === true;
        setState({
          stripe: configured('stripe'),
          bitripay: configured('bitripay'),
          koda: configured('koda'),
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
