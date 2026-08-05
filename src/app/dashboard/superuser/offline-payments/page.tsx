'use client';

import * as React from 'react';
import { Loader2, Smartphone } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useToast } from '@/frontend/hooks/use-toast';
import {
  createTicket,
  getEventById,
  getPendingOfflinePayments,
  updateOfflinePaymentStatus,
} from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import type { OfflinePayment, UserProfile } from '@/shared/types';

function OfflinePayments({ profile }: { profile: UserProfile }) {
  const { toast } = useToast();
  const [payments, setPayments] = React.useState<OfflinePayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    getPendingOfflinePayments()
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  /**
   * Approving a payment is what issues the ticket — the customer's submission alone
   * never creates one. Denying simply closes the record.
   */
  const decide = async (payment: OfflinePayment, decision: 'approved' | 'denied') => {
    setWorking(payment.id);
    try {
      await updateOfflinePaymentStatus(payment.id, decision, profile.uid);

      if (decision === 'approved') {
        const event = await getEventById(payment.eventId);
        if (!event) throw new Error('The event for this payment no longer exists.');

        await createTicket({
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          eventLocation: event.location,
          organizerId: event.organizerId,
          organizerName: event.organizerName,
          userId: payment.userId,
          attendeeName: payment.userName,
          attendeeEmail: payment.userEmail,
          tierName: 'Mobile money purchase',
          price: payment.baseAmount,
          currency: payment.currency,
          paymentProvider: 'offline',
        });
      }

      setPayments((current) => current.filter((p) => p.id !== payment.id));
      toast({
        title: decision === 'approved' ? 'Payment approved — ticket issued' : 'Payment denied',
        description: payment.reference,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not process the payment',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Offline payments</h1>
        <p className="text-sm text-muted-foreground">
          Mobile-money transactions awaiting verification. Approving a reference issues the
          customer&apos;s ticket automatically.
        </p>
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Smartphone className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No payments waiting for verification.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                    <TableCell>
                      <p className="font-medium">{payment.userName}</p>
                      <p className="text-xs text-muted-foreground">{payment.userEmail}</p>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate">{payment.eventTitle}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {payment.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(payment.totalAmount, payment.currency)}
                      <p className="text-xs text-muted-foreground">
                        incl. {formatCurrency(payment.serviceFee, payment.currency)} fee
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={working === payment.id}
                          onClick={() => void decide(payment, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working === payment.id}
                          onClick={() => void decide(payment, 'denied')}
                        >
                          Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function OfflinePaymentsPage() {
  return (
    <RequireRole role="superuser">{(profile) => <OfflinePayments profile={profile} />}</RequireRole>
  );
}
