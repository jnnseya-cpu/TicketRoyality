'use client';

import * as React from 'react';
import { HeartHandshake, Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { DECLARATION_TEXT, giftAidOnMinor } from '@/shared/gift-aid';
import { formatCurrency } from '@/shared/utils';
import { cn } from '@/shared/utils';
import type { Event } from '@/shared/types';

/**
 * Adding a gift to a ticket purchase.
 *
 * ## The donation is a separate amount, and that is not presentation
 *
 * Gift Aid is claimed on a gift, never on a payment for admission. So the amount here
 * travels to checkout as its own field, is charged with **no platform fee**, and is
 * recorded in its own collection when the money lands. Rolling it into the ticket price
 * would produce a number no charity could ever claim on, and one they might claim on
 * anyway.
 *
 * ## Why the declaration is saved before the card, not after
 *
 * A Gift Aid declaration is a statement the donor makes about their own tax position. It
 * is saved under their signed-in account the moment they make it, so it survives them
 * abandoning the payment — and because it is enduring, it makes their *past* gifts to
 * this charity claimable too. A declaration captured only on a successful payment would
 * lose both.
 */
export function DonationBox({
  event,
  onAmountChange,
  userId,
}: {
  event: Event;
  /** Minor units, handed up so the checkout form can carry it as a hidden field. */
  onAmountChange: (minor: number) => void;
  /** Carried into a monthly gift so it can be stopped from the donor's own account. */
  userId?: string;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState(0);
  const [custom, setCustom] = React.useState('');
  const [wantsGiftAid, setWantsGiftAid] = React.useState(false);
  const [declared, setDeclared] = React.useState<boolean | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    addressLine: '',
    postcode: '',
  });

  const giving = event.giving;
  const suggested = giving?.suggested?.length ? giving.suggested : [5, 10, 25];

  React.useEffect(() => {
    onAmountChange(amount);
  }, [amount, onAmountChange]);

  // Whether this donor already has a declaration with this charity. Null until known, so
  // the form is not offered to somebody who has already given it.
  React.useEffect(() => {
    if (!giving?.enabled) return;
    let cancelled = false;

    void authedFetch(`/api/giving?view=declaration&organiserId=${encodeURIComponent(event.organizerId)}`)
      .then((r) => (r.ok ? r.json() : { declared: false }))
      .then((data: { declared?: boolean }) => {
        if (!cancelled) setDeclared(data.declared ?? false);
      })
      .catch(() => {
        // Signed out, or offline. Giving still works; Gift Aid is what needs an account.
        if (!cancelled) setDeclared(false);
      });

    return () => {
      cancelled = true;
    };
  }, [giving?.enabled, event.organizerId]);

  const saveDeclaration = async () => {
    setSaving(true);
    try {
      const response = await authedFetch('/api/giving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organiserId: event.organizerId, enduring: true, ...form }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Gift Aid not added', description: data.error });
        return;
      }

      setDeclared(true);
      toast({
        title: 'Gift Aid added',
        description: `${event.organizerName} can now claim 25% on this gift and on anything you have given them in the last four years.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Gift Aid not added',
        description: 'We could not reach the server. Your donation is unaffected.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!giving?.enabled) return null;

  const minor = Math.round(amount * 100);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
      <div className="flex items-start gap-2">
        <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">Add a donation</p>
          {giving.appeal && <p className="text-xs text-muted-foreground">{giving.appeal}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggested.map((value) => (
          <Button
            key={value}
            type="button"
            variant={amount === value ? 'royal' : 'outline'}
            size="sm"
            onClick={() => {
              // Tapping the chosen amount again clears it: giving must be as easy to
              // undo as it is to do, or it is not a choice.
              setAmount(amount === value ? 0 : value);
              setCustom('');
            }}
          >
            {formatCurrency(value, event.currency)}
          </Button>
        ))}

        <Input
          type="number"
          min={1}
          step="1"
          inputMode="decimal"
          placeholder="Other"
          className="h-9 w-24"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setAmount(Math.max(0, Number(e.target.value) || 0));
          }}
        />
      </div>

      {minor > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {/* Said plainly, because "no fees" is the claim this platform is built on and
                a donation is where people most expect to be quietly charged. */}
            We take no fee on donations — {event.organizerName} receives all{' '}
            {formatCurrency(amount, event.currency)}.
          </p>

          {declared === true ? (
            <p className="text-xs text-primary">
              Gift Aid is already set up — worth another{' '}
              {formatCurrency(giftAidOnMinor(minor) / 100, event.currency)} to them at no cost to you.
            </p>
          ) : (
            <div className="space-y-3 rounded-md border border-dashed border-border p-3">
              <label className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={wantsGiftAid}
                  onCheckedChange={(v) => setWantsGiftAid(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">
                    Add Gift Aid — worth {formatCurrency(giftAidOnMinor(minor) / 100, event.currency)} more
                  </span>
                  <span className="block text-muted-foreground">
                    at no extra cost to you, if you pay UK tax.
                  </span>
                </span>
              </label>

              {wantsGiftAid && (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">First name</Label>
                      <Input
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last name</Label>
                      <Input
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">House number or name</Label>
                      <Input
                        value={form.addressLine}
                        onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Postcode</Label>
                      <Input
                        value={form.postcode}
                        onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* The exact wording, shown before it is agreed to and stored with the
                      declaration. In an audit the question is what this donor was shown. */}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {DECLARATION_TEXT}
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void saveDeclaration()}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Agree and add Gift Aid
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {minor > 0 && (
        /*
         * A monthly gift leaves the ticket purchase alone entirely: it is its own Stripe
         * subscription, so this is a separate form rather than another hidden field. A
         * donor choosing it still buys their ticket with the button below — the two are
         * not alternatives, and one must never quietly cancel the other.
         */
        <form action="/api/giving/recurring" method="POST" className="pt-1">
          <input type="hidden" name="organiserId" value={event.organizerId} />
          <input type="hidden" name="amountMinor" value={minor} />
          <input type="hidden" name="currency" value={event.currency} />
          <input type="hidden" name="userId" value={userId ?? ''} />
          <Button type="submit" variant="ghost" size="sm" className="h-auto p-0 text-xs">
            Give {formatCurrency(amount, event.currency)} every month instead
          </Button>
        </form>
      )}

      {giving.charityNumber && (
        <p className={cn('text-[11px] text-muted-foreground')}>
          Registered charity {giving.charityNumber}
        </p>
      )}
    </div>
  );
}
