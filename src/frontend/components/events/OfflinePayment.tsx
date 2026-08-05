'use client';

import * as React from 'react';
import { Loader2, Smartphone } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/frontend/components/ui/radio-group';
import { useToast } from '@/frontend/hooks/use-toast';
import { createOfflinePayment } from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import { OFFLINE_PROVIDERS, OFFLINE_SERVICE_FEE_PERCENT } from '@/shared/constants/billing';
import type { Event, OfflineProvider, UserProfile } from '@/shared/types';

/**
 * Mobile-money flow for Congolese customers.
 *
 * The customer pays offline to the displayed number, then submits their transaction
 * reference. A superuser verifies it, and approval is what releases the ticket —
 * nothing is issued on submission alone.
 */
export function OfflinePayment({
  event,
  amount,
  user,
}: {
  event: Event;
  amount: number;
  user: UserProfile;
}) {
  const { toast } = useToast();
  const [provider, setProvider] = React.useState<OfflineProvider>('vodacom');
  const [reference, setReference] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const selected = OFFLINE_PROVIDERS.find((p) => p.id === provider)!;
  const serviceFee = (amount * OFFLINE_SERVICE_FEE_PERCENT) / 100;
  const total = amount + serviceFee;

  const handleSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (reference.trim().length < 4) {
      toast({
        variant: 'destructive',
        title: 'Reference too short',
        description: 'Enter the transaction reference exactly as your provider sent it.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await createOfflinePayment({
        userId: user.uid,
        userEmail: user.email,
        userName: user.fullName,
        eventId: event.id,
        eventTitle: event.title,
        provider,
        paymentNumber: selected.number,
        baseAmount: amount,
        serviceFee,
        totalAmount: total,
        currency: event.currency,
        reference: reference.trim(),
      });
      setSubmitted(true);
      toast({
        title: 'Payment submitted for verification',
        description: 'Your ticket is released as soon as an administrator approves it.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not submit payment',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Alert variant="success">
        <Smartphone />
        <AlertTitle>Awaiting verification</AlertTitle>
        <AlertDescription>
          Reference <strong>{reference}</strong> has been sent for review. Your ticket will appear
          in your dashboard once an administrator approves the transaction.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">Mobile money (Congo)</p>
        <p className="text-xs text-muted-foreground">
          Pay offline, then submit your reference. A {OFFLINE_SERVICE_FEE_PERCENT}% service charge
          applies.
        </p>
      </div>

      <RadioGroup
        value={provider}
        onValueChange={(next) => setProvider(next as OfflineProvider)}
        className="grid grid-cols-2 gap-2"
      >
        {OFFLINE_PROVIDERS.map((option) => (
          <Label
            key={option.id}
            htmlFor={`provider-${option.id}`}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary"
          >
            <RadioGroupItem id={`provider-${option.id}`} value={option.id} />
            {option.name}
          </Label>
        ))}
      </RadioGroup>

      <div className="rounded-md bg-secondary/60 p-3 text-sm">
        <p className="flex justify-between">
          <span className="text-muted-foreground">Pay to</span>
          <span className="font-mono font-medium">{selected.number}</span>
        </p>
        <p className="mt-1 flex justify-between">
          <span className="text-muted-foreground">Ticket</span>
          <span>{formatCurrency(amount, event.currency)}</span>
        </p>
        <p className="mt-1 flex justify-between">
          <span className="text-muted-foreground">
            Service charge ({OFFLINE_SERVICE_FEE_PERCENT}%)
          </span>
          <span>{formatCurrency(serviceFee, event.currency)}</span>
        </p>
        <p className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>Total to send</span>
          <span className="text-primary">{formatCurrency(total, event.currency)}</span>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="offline-reference">Transaction reference</Label>
        <Input
          id="offline-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. MP240612.1430.A12345"
          autoComplete="off"
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit for verification
      </Button>
    </form>
  );
}
