import { NextResponse } from 'next/server';

import { FieldValue } from 'firebase-admin/firestore';

import { requireUser } from '@/backend/auth/require-user';
import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The welcome email nobody was getting.
 *
 * `catalogue.ts` has declared `account.welcome.customer` and `account.welcome.organiser`
 * since the comms work landed, and nothing ever dispatched either of them. Registration
 * created the Auth user, wrote the profile, and stopped — so somebody could apply as an
 * organiser and receive no acknowledgement at all, on a platform whose product is a
 * ticket delivered by email.
 *
 * ## Why this is a server route
 *
 * `dispatch()` holds the SMTP credentials and is `server-only`, and registration happens
 * in the browser. So the form calls this immediately after the profile exists.
 *
 * ## Why it does not trust anything the caller sends
 *
 * The body carries nothing. The recipient is read from `users/{uid}` using the uid on the
 * verified token, because a route that emails whatever address it is handed, from the
 * platform's own mailbox, is an open relay — the same reasoning that put `requireAdmin`
 * in front of `/api/comms/test`. The worst a caller can do here is send themselves the
 * welcome email they were already entitled to, once.
 *
 * ## Why the flag is claimed before the send
 *
 * A double-submit, a retry, or a re-run of the resumable registration path would
 * otherwise send the same email twice. The claim is a conditional transaction, so only
 * one caller can win it. If the send then fails the claim is released, because a flag
 * that survives a failure means the email can never be retried — an unsent message
 * recorded as sent.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'Server auth is not configured.' }, { status: 503 });
  }

  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  const db = getAdminDb();
  const ref = db.collection('users').doc(caller.uid);

  let profile: { email?: string; fullName?: string; userType?: string } | undefined;

  try {
    // Claim, so a retry or a double-submit cannot send twice.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 'no-profile' as const;

      const data = snap.data() as typeof profile & { welcomeEmailSentAt?: string };
      if (data?.welcomeEmailSentAt) return 'already' as const;

      profile = data;
      tx.update(ref, { welcomeEmailSentAt: new Date().toISOString() });
      return 'claimed' as const;
    });

    if (claimed === 'no-profile') {
      // The profile write has not landed yet. Not an error worth showing anybody — the
      // caller is mid-registration and will not call again.
      return NextResponse.json({ ok: true, sent: false, reason: 'no-profile' });
    }
    if (claimed === 'already') {
      return NextResponse.json({ ok: true, sent: false, reason: 'already-sent' });
    }
  } catch (error) {
    reportError(error, { scope: 'account/welcome', stage: 'claim', uid: caller.uid });
    return NextResponse.json({ ok: false, error: 'Could not record the welcome email.' }, { status: 500 });
  }

  const organiser = profile?.userType === 'organiser';
  const name = profile?.fullName ?? 'there';
  const email = profile?.email;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  try {
    const result = await dispatch({
      eventKey: organiser ? 'account.welcome.organiser' : 'account.welcome.customer',
      recipient: { email, userId: caller.uid },
      vars: { actor: name },
      body: organiser
        ? [
            `Thanks for applying, ${name}.`,
            'Your organiser account is being reviewed. We look at every application by hand, so this is usually the same working day.',
            'You can explore your dashboard now — building an event draft, setting up ticket tiers and adding your team all work while the review is in progress. Publishing is the only thing that waits.',
            'You are charged no commission and no per-ticket fee — you keep 100% of every ticket’s face value.',
          ]
        : [
            `Welcome to TicketRoyality, ${name}.`,
            'Your account is ready. Tickets you buy live in your dashboard, and each one carries its own scan code — there is nothing to print.',
            'Every new account starts with a small credit for the AI features. It is already on your balance.',
          ],
      action: {
        label: organiser ? 'Open your dashboard' : 'Find something to go to',
        url: organiser ? `${site}/dashboard/organiser` : `${site}/events`,
      },
    });

    // Only the email channel counts. `dispatch()` records SMS and WhatsApp and sends
    // nothing — there is no provider — so a run that only produced those is not a
    // welcome email anybody received.
    const delivered = result.records.some(
      (r) => r.channel === 'email' && (r.status === 'sent' || r.status === 'queued')
    );

    if (!delivered) {
      // Release the claim so it can be retried rather than recorded as sent.
      await ref.update({ welcomeEmailSentAt: FieldValue.delete() }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, sent: delivered });
  } catch (error) {
    reportError(error, { scope: 'account/welcome', stage: 'dispatch', uid: caller.uid });
    await ref.update({ welcomeEmailSentAt: FieldValue.delete() }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'The welcome email could not be sent.' }, { status: 502 });
  }
}
