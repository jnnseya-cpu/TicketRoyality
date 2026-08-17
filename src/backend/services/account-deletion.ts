import 'server-only';

import { getAuth } from 'firebase-admin/auth';

import { dispatch } from '@/backend/comms/dispatch';
import { getAdminApp, getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';

/**
 * Deleting your own account, for real.
 *
 * What was here before was a toast. `DeleteAccountDialog` told the user "your account is
 * scheduled for deletion, our team will confirm by email within 30 days", signed them
 * out, and did nothing else — no record, no email, no deletion. A right-to-erasure
 * request under UK GDPR Article 17 was being silently discarded while the product
 * claimed otherwise, which is worse than not offering the button at all.
 *
 * ## What is destroyed and what is kept
 *
 * The Auth user and the `users/{uid}` document go. Tickets do **not**: they are the
 * organiser's attendance record and part of a financial record the platform is required
 * to keep under Article 17(3)(b), which is the exception erasure does not override. So
 * each ticket is stripped of the attendee's name and email and its `userId` is cleared —
 * the row survives as an anonymous seat, and nothing in it points back to a person.
 *
 * ## What refuses, and why
 *
 * An **administrator** cannot delete themselves here. `grant:admin` runs from a machine
 * with service-account credentials, so the last superuser deleting their own account
 * leaves no door back into the platform from inside the product.
 *
 * An **organiser with tickets sold on an upcoming event** cannot either. Their events
 * would outlive them with no one able to scan the door, and the buyers already paid.
 * They are told which events, and to cancel and refund those first.
 *
 * ## Ordering
 *
 * Email before deletion, because the address is about to stop existing. Auth user last,
 * because it is the only step that cannot be retried — while it still exists the user
 * can sign in and try again, and a half-finished deletion is recoverable. Reverse the
 * order and a Firestore failure leaves an account that cannot log in and cannot be
 * fixed by its owner.
 */

export type DeletionOutcome =
  | { ok: true; ticketsAnonymised: number }
  | { ok: false; status: 403 | 409 | 503; error: string; blockingEvents?: string[] };

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function deleteOwnAccount(uid: string): Promise<DeletionOutcome> {
  if (!isAdminConfigured()) {
    return { ok: false, status: 503, error: 'Account deletion is not available right now.' };
  }

  const db = getAdminDb();

  let profile: FirebaseFirestore.DocumentData | undefined;
  try {
    const doc = await db.collection('users').doc(uid).get();
    profile = doc.data();
  } catch {
    return { ok: false, status: 503, error: 'Could not read your account. Please try again.' };
  }

  if (profile?.userType === 'superuser') {
    return {
      ok: false,
      status: 403,
      error:
        'Administrator accounts cannot be deleted from the dashboard. Administrator rights are granted from the server and have to be removed there first.',
    };
  }

  // An organiser still holding money for events that have not happened.
  if (profile?.userType === 'organiser') {
    try {
      const events = await db
        .collection('events')
        .where('organizerId', '==', uid)
        .limit(200)
        .get();

      const now = Date.now();
      const upcoming = events.docs.filter((doc) => {
        const date = (doc.data() as { date?: string }).date;
        return date ? new Date(date).getTime() > now : false;
      });

      const blocking: string[] = [];
      for (const event of upcoming) {
        const sold = await db
          .collection('tickets')
          .where('eventId', '==', event.id)
          .limit(1)
          .get();
        if (!sold.empty) blocking.push((event.data() as { title?: string }).title ?? event.id);
      }

      if (blocking.length > 0) {
        return {
          ok: false,
          status: 409,
          error:
            'You still have tickets sold for events that have not happened yet. Cancel and refund those events first — deleting your account now would leave your buyers with tickets nobody can honour.',
          blockingEvents: blocking,
        };
      }
    } catch {
      // Refusing is the safe direction: a check that cannot run must not be read as a pass.
      return {
        ok: false,
        status: 503,
        error: 'Could not check your upcoming events. Please try again shortly.',
      };
    }
  }

  // Confirmation email first — the address is about to be erased. `mandatory: true` on
  // this catalogue event means a marketing opt-out cannot suppress it.
  const email = typeof profile?.email === 'string' ? profile.email : undefined;
  if (email) {
    try {
      await dispatch({
        eventKey: 'account.deletion.completed',
        recipient: { email, userId: uid },
        vars: { name: String(profile?.fullName ?? '') },
        body: [
          'Your TicketRoyality account has been deleted. Your profile and sign-in are gone and cannot be restored.',
          'Tickets you bought are kept as anonymous records with your name and email removed. We are required to retain the financial record of a purchase, and UK GDPR Article 17(3)(b) is the exception that requires it — but nothing in those records points back to you.',
          'If you did not ask for this, reply to this email immediately.',
        ],
      });
    } catch (error) {
      // A failed email must not abort the erasure — the request is the user's right, and
      // the notification is a courtesy on top of it.
      console.error('[account-deletion] confirmation email failed', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let ticketsAnonymised = 0;
  try {
    const tickets = await db.collection('tickets').where('userId', '==', uid).get();
    for (const group of chunk(tickets.docs, BATCH_LIMIT)) {
      const batch = db.batch();
      for (const ticket of group) {
        batch.update(ticket.ref, {
          userId: '',
          attendeeName: 'Deleted account',
          attendeeEmail: '',
          anonymisedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      ticketsAnonymised += group.length;
    }
  } catch (error) {
    console.error('[account-deletion] ticket anonymisation failed', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      status: 503,
      error: 'Could not remove your details from your tickets. Nothing has been deleted.',
    };
  }

  try {
    await db.collection('users').doc(uid).delete();
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Could not delete your profile. Please try again — your sign-in still works.',
    };
  }

  // Audit trail with nothing personal in it: the uid is now a dangling identifier that
  // resolves to no person, which is what makes it safe to keep.
  try {
    await db.collection('account_deletions').doc(uid).set({
      deletedAt: new Date().toISOString(),
      ticketsAnonymised,
    });
  } catch {
    // Not worth failing a completed erasure over.
  }

  try {
    await getAuth(getAdminApp()).deleteUser(uid);
  } catch (error) {
    console.error('[account-deletion] auth user delete failed', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      status: 503,
      error:
        'Your profile was removed but your sign-in could not be deleted. Contact info@ticketroyality.com and we will finish it.',
    };
  }

  return { ok: true, ticketsAnonymised };
}
