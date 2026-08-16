import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb } from '@/backend/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approve or decline an organiser application.
 *
 * The decision used to be written straight from the browser with the client SDK, which
 * worked — `firestore.rules` lets a superuser update any user — but left the applicant
 * with no idea it had happened. They waited, then emailed to ask. Approval is the gate
 * on their entire ability to sell, so it is the notification most worth sending.
 *
 * Moving the write server-side is what makes the notification possible at all:
 * `dispatch()` is server-only, and it should be, because it holds the SMTP credentials.
 * The move also puts a privileged write behind a verified administrator rather than
 * behind rules alone.
 */

interface DecisionRequest {
  uid?: string;
  decision?: 'approved' | 'suspended';
  /** Optional reason, included in a decline so the applicant knows what to fix. */
  reason?: string;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: DecisionRequest;
  try {
    body = (await request.json()) as DecisionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { uid, decision } = body;
  if (!uid) return NextResponse.json({ error: 'uid is required.' }, { status: 400 });
  if (decision !== 'approved' && decision !== 'suspended') {
    return NextResponse.json(
      { error: 'decision must be "approved" or "suspended".' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection('users').doc(uid);

  let profile: { email?: string; fullName?: string; userType?: string; status?: string };
  try {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'No such account.' }, { status: 404 });
    profile = snap.data() as typeof profile;
  } catch {
    return NextResponse.json({ error: 'Could not read the account.' }, { status: 503 });
  }

  if (profile.userType !== 'organiser') {
    return NextResponse.json(
      { error: 'That account is not an organiser application.' },
      { status: 400 }
    );
  }

  // Idempotent by state. A double-click, or two administrators reviewing the same queue,
  // must not send the applicant two approval emails.
  if (profile.status === decision) {
    return NextResponse.json({ status: decision, alreadyApplied: true, notified: false });
  }

  try {
    await ref.update({
      status: decision,
      statusDecidedAt: new Date().toISOString(),
      statusDecidedBy: auth.uid,
      ...(body.reason ? { statusReason: body.reason } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Could not save the decision.' }, { status: 503 });
  }

  // The write is the decision; the email is a courtesy on top of it. A dispatch failure
  // must not turn a saved approval into an error the administrator retries, which would
  // be a second write and a second email.
  let notified = false;
  try {
    const approved = decision === 'approved';
    const result = await dispatch({
      eventKey: approved ? 'organiser.approved' : 'organiser.rejected',
      recipient: { email: profile.email, userId: uid },
      vars: { actor: profile.fullName ?? 'there' },
      body: approved
        ? [
            `Good news — your organiser account on TicketRoyality has been approved.`,
            'You can publish events, sell tiered and VIP tickets, run door check-in and track revenue from your dashboard.',
            'Free tickets carry no commission. Paid tickets are 5% plus 50p, and that is the whole fee.',
          ]
        : [
            'We have reviewed your organiser application and are not able to approve it at this time.',
            body.reason ?? 'If you think this is a mistake, reply to this email and we will take another look.',
          ],
      action: approved
        ? { label: 'Open your dashboard', url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard/organiser` }
        : undefined,
    });
    notified = result.records.some((record) => record.status === 'sent');
  } catch (error) {
    console.error('[organiser-decision] notification failed', {
      uid,
      decision,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ status: decision, notified });
}
