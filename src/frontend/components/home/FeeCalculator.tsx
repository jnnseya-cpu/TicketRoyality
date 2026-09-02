'use client';

import * as React from 'react';

import { serviceFeeForTicket, toMajor, toMinor } from '@/shared/fees';
import { cn } from '@/shared/utils';

/**
 * The take-home / fan-price calculator.
 *
 * The single most persuasive thing an unknown platform can put in front of an organiser
 * is their *own* money, computed in front of them — not a slogan about it. This turns
 * "0% commission" from an abstraction that reads as too-good-to-be-true into a figure
 * they can check against the ticket they actually sell.
 *
 * Honesty rules this component lives by (CLAUDE.md §6, §10):
 *
 * - **Our numbers are exact.** `serviceFeeForTicket` is the very function the checkout
 *   charges through — the fan fee shown here is the fee the buyer will pay, not a
 *   marketing approximation of it. There is no second, prettier fee model for the
 *   landing page.
 * - **Competitor numbers are labelled estimates and are editable.** We do not assert a
 *   rival's fee as fact — their plans vary and change. The field is seeded with a
 *   representative published rate and the organiser can set it to the exact quote they
 *   were given. An honest calculator that lets the comparison be corrected persuades far
 *   better than one rigged to always win.
 * - **The axis is what the fan pays.** On any platform that lets an organiser pass fees
 *   on, the organiser keeps face either way; the honest, checkable difference is the fee
 *   the buyer meets at checkout — a lower one abandons fewer baskets. We do not claim a
 *   rival takes money out of the organiser's pocket.
 */

const PRESETS: Array<{ label: string; pct: number; fixed: number }> = [
  // Representative published UK *service*/booking fees, seeded as a starting point and
  // fully editable. Not asserted as current fact — rivals change plans and rates.
  { label: 'Eventbrite‑style', pct: 6.95, fixed: 0.59 },
  { label: 'Fatsoma‑style', pct: 10, fixed: 0 },
  { label: 'Flat‑fee style', pct: 0, fixed: 0.5 },
];

function gbp(minor: number): string {
  return `£${toMajor(Math.round(minor)).toFixed(2)}`;
}

export function FeeCalculator() {
  const [price, setPrice] = React.useState(20);
  const [qty, setQty] = React.useState(200);
  // Seeded from the first preset; editable so the organiser can enter their real quote.
  const [rivalPct, setRivalPct] = React.useState(PRESETS[0].pct);
  const [rivalFixed, setRivalFixed] = React.useState(PRESETS[0].fixed);

  const faceMinor = toMinor(Math.max(0, price));
  const quantity = Math.max(1, Math.round(qty || 1));

  // Ours: straight from the checkout's own fee function.
  const ourFeeMinor = serviceFeeForTicket(faceMinor);
  const ourFanEach = faceMinor + ourFeeMinor;

  // Theirs: the estimate, from the editable rate.
  const rivalFeeMinor =
    faceMinor <= 0 ? 0 : Math.round((faceMinor * rivalPct) / 100) + toMinor(rivalFixed);
  const rivalFanEach = faceMinor + rivalFeeMinor;

  const youKeepMinor = faceMinor * quantity;
  const fanSavesEach = rivalFanEach - ourFanEach;
  const fanSavesTotal = fanSavesEach * quantity;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      {/* Controls */}
      <div className="space-y-6">
        <Field
          label="Ticket price"
          value={price}
          onChange={setPrice}
          min={0}
          max={250}
          step={1}
          prefix="£"
        />
        <Field
          label="Tickets you'll sell"
          value={qty}
          onChange={setQty}
          min={1}
          max={20000}
          step={10}
        />

        <div className="border-t border-border/60 pt-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Compare against
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = preset.pct === rivalPct && preset.fixed === rivalFixed;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setRivalPct(preset.pct);
                    setRivalFixed(preset.fixed);
                  }}
                  className={cn(
                    'rounded-[--radius] border px-3 py-1.5 text-xs transition-colors',
                    active
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border/70 text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Their %" value={rivalPct} onChange={setRivalPct} min={0} max={25} step={0.05} suffix="%" small />
            <Field label="Their fixed" value={rivalFixed} onChange={setRivalFixed} min={0} max={5} step={0.05} prefix="£" small />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Estimate — a rival&apos;s fees vary by plan and change over time. Set these to
            the exact quote you were given. Our figures come straight from our live
            checkout fee engine, not a marketing rounding.
          </p>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-[--radius] border border-border/70 bg-card/40 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">You keep</p>
        <p className="mt-1 font-headline text-4xl font-bold text-primary sm:text-5xl">
          {gbp(youKeepMinor)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          100% of face value · 0% commission · no plan takes a cut
        </p>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[--radius] border border-border/60 bg-border/60 text-center">
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Your fan pays (us)</p>
            <p className="mt-1 font-headline text-2xl font-bold">{gbp(ourFanEach)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {gbp(faceMinor)} + {gbp(ourFeeMinor)} fee
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Your fan pays (them)</p>
            <p className="mt-1 font-headline text-2xl font-bold text-muted-foreground">
              {gbp(rivalFanEach)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {gbp(faceMinor)} + {gbp(rivalFeeMinor)} fee
            </p>
          </div>
        </div>

        {fanSavesEach > 0 ? (
          <p className="mt-5 text-sm leading-relaxed">
            <span className="font-semibold text-foreground">
              {gbp(fanSavesEach)} lower per ticket
            </span>{' '}
            at checkout —{' '}
            <span className="font-semibold text-foreground">{gbp(fanSavesTotal)}</span> across{' '}
            {quantity.toLocaleString()} tickets. A cheaper all‑in price abandons fewer baskets,
            so the same fans buy more.
          </p>
        ) : fanSavesEach < 0 ? (
          // We show it honestly even when a flat‑fee rival is cheaper on a high‑value
          // ticket — the point of the tool is that it can be trusted, not that it always wins.
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            On a ticket this size their fee happens to land lower. You still keep 100% of face
            with us, pay 0% commission on any plan, and get door sales, offline scanning and
            mobile money in the same platform.
          </p>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Level on fee here — and you still pay us 0% commission, keep 100% of face, and get
            door sales, offline scanning and mobile money in one platform.
          </p>
        )}

        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Our fee is one all‑in, VAT‑inclusive booking fee shown to the fan before they pay —
          3.99% + £0.49, minimum £0.79. It is how we earn instead of charging you: you are
          never invoiced and never see a line deducted from your face value.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  small,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  small?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          'mt-2 flex items-center rounded-[--radius] border border-border/70 bg-background/60 px-3',
          small ? 'h-10' : 'h-12'
        )}
      >
        {prefix && <span className="mr-1 text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min);
          }}
          className={cn(
            'w-full bg-transparent font-headline font-semibold outline-none',
            small ? 'text-lg' : 'text-2xl'
          )}
        />
        {suffix && <span className="ml-1 text-muted-foreground">{suffix}</span>}
      </div>
      {!small && (
        <input
          type="range"
          value={Number.isFinite(value) ? value : min}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-3 w-full accent-[hsl(var(--primary))]"
          aria-label={label}
        />
      )}
    </label>
  );
}
