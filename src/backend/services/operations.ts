import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * Platform operations — the states that cost money if nobody looks.
 *
 * `/STATUS.md` lists what has to be watched after launch, and until now none of it was
 * visible anywhere in the product. A payment could take a customer's money, fail to
 * produce a ticket, and the only trace would be a line in Cloud Logging that nobody
 * reads. The first sign would be the customer.
 *
 * Every figure here is a real query. Nothing is estimated, and an unreachable database
 * yields an empty console rather than a plausible-looking zero — the difference matters
 * when the number you are looking at is "payments that owe somebody a refund".
 */

export type Health = 'ok' | 'attention' | 'urgent';

export interface OperationsAlert {
  key: string;
  label: string;
  count: number;
  health: Health;
  /** What this state means, and what to do about it. */
  meaning: string;
  /** Enough to act on, without dumping personal data into the console. */
  samples: Array<{ id: string; at?: string; reason?: string; email?: string }>;
}

export interface OperationsReport {
  generatedAt: string;
  available: boolean;
  alerts: OperationsAlert[];
  totals: {
    paymentEvents: number;
    issued: number;
    /** Payments that produced no ticket and are owed a refund. */
    owedRefund: number;
  };
}

/** Ten minutes. Past this, the trigger did not fire and the sweep has not caught it. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

const LIMIT = 200;
const SAMPLES = 5;

function empty(reason: string): OperationsReport {
  return {
    generatedAt: new Date().toISOString(),
    available: false,
    alerts: [
      {
        key: 'unavailable',
        label: 'Operations data unavailable',
        count: 0,
        health: 'attention',
        meaning: reason,
        samples: [],
      },
    ],
    totals: { paymentEvents: 0, issued: 0, owedRefund: 0 },
  };
}

export async function operationsReport(now = new Date()): Promise<OperationsReport> {
  if (!isAdminConfigured()) return empty('The Admin SDK is not configured on this deployment.');

  const db = getAdminDb();

  try {
    const [oversold, failed, pending, processing, deliveries] = await Promise.all([
      db.collection('payment_events').where('status', '==', 'oversold').limit(LIMIT).get(),
      db.collection('payment_events').where('status', '==', 'failed').limit(LIMIT).get(),
      db.collection('payment_events').where('status', '==', 'pending').limit(LIMIT).get(),
      db.collection('payment_events').where('status', '==', 'processing').limit(LIMIT).get(),
      db.collection('issued_payments').limit(LIMIT).get(),
    ]);

    const sample = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
      docs.slice(0, SAMPLES).map((doc) => {
        const data = doc.data() as { receivedAt?: string; reason?: string; attendeeEmail?: string };
        return {
          id: doc.id,
          at: data.receivedAt,
          reason: data.reason,
          email: data.attendeeEmail,
        };
      });

    // `pending` and `processing` are both normal for a few seconds and both wrong after
    // ten minutes — a trigger that never fired looks identical to one still running,
    // which is why the age is the signal rather than the state.
    const stuck = [...pending.docs, ...processing.docs].filter((doc) => {
      const receivedAt = (doc.data() as { receivedAt?: string }).receivedAt;
      if (!receivedAt) return true;
      return now.getTime() - new Date(receivedAt).getTime() > STUCK_AFTER_MS;
    });

    const deliveryFailed = deliveries.docs.filter((doc) =>
      String((doc.data() as { delivery?: string }).delivery ?? '').startsWith('failed:')
    );
    const deliverySkipped = deliveries.docs.filter(
      (doc) => (doc.data() as { delivery?: string }).delivery === 'skipped'
    );

    const alerts: OperationsAlert[] = [
      {
        key: 'oversold',
        label: 'Paid, no ticket — oversold',
        count: oversold.size,
        health: oversold.size > 0 ? 'urgent' : 'ok',
        meaning:
          'The tier sold out while their payment completed. They have been charged, no ticket can be issued, and they are owed a refund. They were emailed automatically — the refund still has to be made in Stripe or KODA.',
        samples: sample(oversold.docs),
      },
      {
        key: 'failed',
        label: 'Paid, no ticket — issuance failed',
        count: failed.size,
        health: failed.size > 0 ? 'urgent' : 'ok',
        meaning:
          'Issuance gave up after five attempts. Money moved and no ticket exists. A person has to look at the reason and either fix it forward or refund.',
        samples: sample(failed.docs),
      },
      {
        key: 'stuck',
        label: 'Stuck over 10 minutes',
        count: stuck.length,
        health: stuck.length > 0 ? 'urgent' : 'ok',
        meaning:
          'A payment event has sat unprocessed. The trigger did not fire and the ten-minute reconciliation sweep has not rescued it — check that the Cloud Functions are deployed and healthy.',
        samples: sample(stuck),
      },
      {
        key: 'delivery_failed',
        label: 'Tickets issued, email failed',
        count: deliveryFailed.length,
        health: deliveryFailed.length > 0 ? 'attention' : 'ok',
        meaning:
          'The ticket exists and the buyer has not received it. They can still see it in their wallet, but they do not know that. Check SMTP and resend.',
        samples: sample(deliveryFailed),
      },
      {
        key: 'delivery_skipped',
        label: 'Tickets issued, no email attempted',
        count: deliverySkipped.length,
        health: deliverySkipped.length > 0 ? 'attention' : 'ok',
        meaning:
          'SMTP was unconfigured at the time, or the buyer had no email address. Nothing was sent and nothing was retried.',
        samples: sample(deliverySkipped),
      },
    ];

    return {
      generatedAt: now.toISOString(),
      available: true,
      alerts,
      totals: {
        paymentEvents:
          oversold.size + failed.size + pending.size + processing.size + deliveries.size,
        issued: deliveries.size,
        owedRefund: oversold.size + failed.size,
      },
    };
  } catch (error) {
    console.error('[operations] report failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return empty(
      'Could not read the payment collections. If this persists, check the Firestore indexes are deployed.'
    );
  }
}
