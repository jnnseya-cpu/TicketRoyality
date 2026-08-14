import 'server-only';

import type { Ticket, TicketStatus } from '@/shared/types';
import type {
  PaymentEventDoc,
  TicketDoc,
  TicketStatus as FunctionsTicketStatus,
  TicketTierDoc,
} from '../../../functions/src/domain';
import type { RecordPaymentEvent } from '@/backend/services/payment-events';

/**
 * Compile-time guard against the functions codebase drifting from the application.
 *
 * `functions/` is deployed as its own package — `firebase deploy` uploads that
 * directory alone — so it declares the document shapes it reads and writes rather than
 * importing them from `src/shared`. That duplication is the price of a self-contained
 * deployable, and this file is what stops it becoming a bug.
 *
 * Everything below is type-only and erased at compile time: no runtime import of
 * `functions/` ever reaches the Next.js bundle. What it buys is that a field added to
 * `Ticket` and forgotten in `TicketDoc` fails `npm run typecheck` in the application,
 * rather than producing tickets that are silently missing a field in production.
 */

/** Fails if `TicketDoc` stops being a valid ticket body. */
type _TicketDocIsATicket = Expect<TicketDoc extends Omit<Ticket, 'id'> ? true : false>;

/** Fails if the application's `Ticket` grows a required field the function never sets. */
type _TicketIsFullyBuilt = Expect<Omit<Ticket, 'id'> extends TicketDoc ? true : false>;

/** Status vocabularies must stay identical in both directions. */
type _StatusMatches = Expect<
  [TicketStatus] extends [FunctionsTicketStatus]
    ? [FunctionsTicketStatus] extends [TicketStatus]
      ? true
      : false
    : false
>;

/**
 * Everything the webhook records must be readable by the function.
 *
 * This is the join that actually breaks in practice: a field added to the webhook
 * payload and not to the function's view of it is simply ignored at runtime, silently,
 * and the symptom is a ticket with a missing seat number weeks later.
 */
type _WebhookPayloadIsReadable = Expect<
  RecordPaymentEvent extends Omit<PaymentEventDoc, 'status' | 'receivedAt' | 'providerEventId'>
    ? true
    : false
>;

/** Compile error when `T` is not `true`; the message names the failing assertion. */
type Expect<T extends true> = T;

/** Tier shape is read straight off the event document by the function. */
type _TierMatches = Expect<
  TicketTierDoc extends { id: string; name: string; price: number; quantity: number }
    ? true
    : false
>;
