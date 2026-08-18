import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { dispatch } from '@/backend/comms/dispatch';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { reportError } from '@/backend/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A placement enquiry that actually arrives.
 *
 * The promotions page's Enquire button was a `mailto:` link. On a machine with no
 * default mail client — most office Windows installs — clicking it does precisely
 * nothing, silently: the organiser believes they enquired, and no email exists anywhere.
 * The one person who tested it hit exactly that.
 *
 * This sends the enquiry through `dispatch()`, the same SMTP path the ticket and
 * approval emails already use, addressed to the platform inbox. The sender's identity
 * comes from the verified token and their profile — not from the request body — so the
 * enquiry cannot impersonate anybody, and the body carries only the two things the
 * platform cannot know: which placement, and which event.
 */
export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) {
    return NextResponse.json({ ok: false, error: caller.error }, { status: caller.status });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'Server is not configured.' }, { status: 503 });
  }

  let body: { placement?: unknown; eventId?: unknown; eventTitle?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
  }

  const placement = typeof body.placement === 'string' ? body.placement.slice(0, 120) : '';
  const eventTitle = typeof body.eventTitle === 'string' ? body.eventTitle.slice(0, 200) : '';
  if (!placement) {
    return NextResponse.json({ ok: false, error: 'Name the placement.' }, { status: 400 });
  }

  let profile: { fullName?: string; companyName?: string; email?: string } | undefined;
  try {
    const snap = await getAdminDb().collection('users').doc(caller.uid).get();
    profile = snap.data() as typeof profile;
  } catch {
    // The enquiry still works with just the auth email.
  }

  const from = profile?.companyName ?? profile?.fullName ?? caller.email ?? caller.uid;

  try {
    const result = await dispatch({
      eventKey: 'promo.placement.enquiry',
      // The platform's own inbox. info@ is the mailbox that sends and receives
      // everything; admin@ deliberately has none.
      recipient: { email: 'info@ticketroyality.com' },
      vars: { placement },
      body: [
        `${from} is asking about: ${placement}.`,
        eventTitle ? `For the event: ${eventTitle}.` : 'No event was selected.',
        `Reply to ${profile?.email ?? caller.email ?? 'their account email'} to quote and invoice.`,
        `Account: ${caller.uid}`,
      ],
    });

    const sent = result.records.some(
      (r) => r.channel === 'email' && (r.status === 'sent' || r.status === 'queued')
    );

    if (!sent) {
      return NextResponse.json(
        { ok: false, error: 'The enquiry could not be sent. Email info@ticketroyality.com directly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, { scope: 'partners/enquiry', uid: caller.uid });
    return NextResponse.json(
      { ok: false, error: 'The enquiry could not be sent. Email info@ticketroyality.com directly.' },
      { status: 502 }
    );
  }
}
