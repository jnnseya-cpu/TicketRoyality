import 'server-only';

import { QR_VERSION as APP_VERSION, qrSigningInput as appSigningInput } from '@/shared/tickets/qr';
import { QR_VERSION as FN_VERSION, qrSigningInput as fnSigningInput } from '../../../functions/src/qr';

/**
 * Compile-time guard against the two QR signing implementations drifting.
 *
 * `functions/` signs a ticket at issuance and the application verifies it at the door,
 * in two separately deployed packages that cannot import from each other. If the signing
 * input format or the version number diverges by one character, every genuine ticket is
 * refused — at an event, at the gate, with a queue outside. That is the failure this
 * file exists to turn into a failed `npm run typecheck`.
 *
 * A type-level check alone would not catch it, since both are `(number, string, string)
 * => string`. So the check is on the produced value, evaluated at module load and thrown
 * rather than logged: a mismatch must stop the server starting, not appear in a log
 * nobody reads until the door is already refusing people.
 */

if (APP_VERSION !== FN_VERSION) {
  throw new Error(
    `QR version mismatch: app is v${APP_VERSION}, functions is v${FN_VERSION}. ` +
      'Tickets signed by one would be refused by the other.'
  );
}

const PROBE = appSigningInput(APP_VERSION, 'ticket-probe', 'event-probe');
if (PROBE !== fnSigningInput(FN_VERSION, 'ticket-probe', 'event-probe')) {
  throw new Error(
    'QR signing input formats have diverged between src/shared/tickets/qr.ts and ' +
      'functions/src/qr.ts. Every genuine ticket would be refused at the door.'
  );
}

export const QR_CONTRACT_OK = true;
