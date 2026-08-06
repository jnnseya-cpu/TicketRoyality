import { NextResponse } from 'next/server';

import { dispatch } from '@/backend/comms/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fires a catalogue event at a single recipient so a template can be proven end to end.
 *
 * Always sandbox unless the caller explicitly asks otherwise, because the failure mode
 * of a test endpoint that really sends is a test that reaches a customer.
 */
export async function POST(request: Request) {
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

    const result = await dispatch({
      eventKey: body.eventKey,
      recipient: {
        email: body.email,
        phone: body.phone,
        userId: 'preview',
        pushToken: 'preview',
      },
      vars: {
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
        recipient: body.email ?? 'a friend',
      },
      sandbox: body.live !== true,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dispatch failed' },
      { status: 400 }
    );
  }
}
