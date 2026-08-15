import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { dispatch } from '@/backend/comms/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fires a catalogue event at a single recipient so a template can be proven end to end.
 *
 * **Administrators only.** This route had no authentication, which was survivable while
 * `dispatch()` recorded and sent nothing. It stopped being survivable the moment
 * dispatch gained a real SMTP path: an unauthenticated endpoint that sends arbitrary
 * subject lines to arbitrary addresses from the platform's own mailbox is an open
 * relay, and the cost is the domain's sending reputation — which, on a platform whose
 * product is a ticket delivered by email, is the product.
 *
 * Sandbox stays the default. The failure mode of a test endpoint that really sends is a
 * test that reaches a customer, so `live: true` has to be asked for explicitly even by
 * an administrator.
 */

const PREVIEW_VARS = {
  event: 'Kinshasa Nights',
  amount: '£45.00',
  acu: 100,
  actor: 'Groupe Nseya',
  item: 'VIP Table',
  number: 'TR-8F3K2M',
  date: '14 March',
  time: '19:00',
  gate: 'East 3',
  percent: '80%',
  code: '482913',
  hours: '48',
};

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      eventKey?: string;
      email?: string;
      phone?: string;
      live?: boolean;
    };

    if (!body.eventKey) {
      return NextResponse.json({ error: 'eventKey is required' }, { status: 400 });
    }

    const live = body.live === true;

    if (live && !body.email) {
      return NextResponse.json(
        { error: 'A live send needs an email address.' },
        { status: 400 }
      );
    }

    const result = await dispatch({
      eventKey: body.eventKey,
      recipient: {
        email: body.email,
        phone: body.phone,
        userId: auth.uid,
        pushToken: 'preview',
      },
      body: [
        'This is a test of a TicketRoyality notification template.',
        'It was sent from the administration console to prove this message renders and delivers correctly. No action is needed.',
      ],
      vars: { ...PREVIEW_VARS, recipient: body.email ?? 'a friend' },
      sandbox: !live,
    });

    // Who fired a live send, so a message a customer asks about can be traced back to
    // a person rather than to "the system".
    if (live) {
      console.info('[comms/test] live send', {
        by: auth.email ?? auth.uid,
        eventKey: body.eventKey,
        to: body.email,
      });
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dispatch failed' },
      { status: 400 }
    );
  }
}
