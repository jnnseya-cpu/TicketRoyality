import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { ALL_SCOPES, createKey, listKeys, revokeKey, type Scope } from '@/backend/services/api-keys';
import {
  ALL_EVENTS,
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
  recentDeliveries,
  type WebhookEvent,
} from '@/backend/services/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The developer settings behind the dashboard: API keys and webhook endpoints.
 *
 * Deliberately not part of the public API itself. A key that can mint more keys is a key
 * whose theft is unrecoverable, so creating credentials needs a signed-in session and
 * cannot be done with a bearer token.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  return NextResponse.json({
    keys: await listKeys(caller.uid),
    endpoints: await listEndpoints(caller.uid),
    deliveries: await recentDeliveries(caller.uid),
    scopes: ALL_SCOPES,
    events: ALL_EVENTS,
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'endpoint') {
    const result = await createEndpoint({
      organizerId: caller.uid,
      url: String(body.url ?? ''),
      events: (Array.isArray(body.events) ? body.events : []) as WebhookEvent[],
    });

    return result.ok
      ? NextResponse.json(result)
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  const result = await createKey({
    organizerId: caller.uid,
    name: String(body.name ?? 'API key'),
    mode: body.mode === 'live' ? 'live' : 'test',
    scopes: (Array.isArray(body.scopes) ? body.scopes : []) as Scope[],
  });

  // The secret is in this response and nowhere else, ever again.
  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: result.reason === 'unconfigured' ? 501 : 503 });
}

export async function DELETE(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const query = new URL(request.url).searchParams;
  const keyId = query.get('keyId');
  const endpointId = query.get('endpointId');

  const done = keyId
    ? await revokeKey(keyId, caller.uid)
    : endpointId
      ? await deleteEndpoint(endpointId, caller.uid)
      : false;

  return done
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Nothing was removed.' }, { status: 400 });
}
