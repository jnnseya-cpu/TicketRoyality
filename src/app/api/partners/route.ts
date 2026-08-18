import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import {
  attributionsFor,
  createLink,
  listLinks,
  setActive,
  statsKey,
} from '@/backend/services/partners';
import type { PartnerKind } from '@/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: PartnerKind[] = ['affiliate', 'influencer', 'promoter', 'sponsor', 'referral'];

/**
 * Partner links, owned by the organiser who created them.
 *
 * The organiser always comes from the verified token. A route that accepted an
 * `organizerId` would let anyone attach an earning link to somebody else's events, which
 * is the same thing as taking their money.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const code = new URL(request.url).searchParams.get('code');
  if (code) {
    const links = await listLinks(caller.uid);
    // Read the rows only for a link this organiser owns.
    if (!links.some((l) => l.code === code.toUpperCase())) {
      return NextResponse.json({ error: 'That is not your link.' }, { status: 403 });
    }
    return NextResponse.json({ rows: await attributionsFor(code) });
  }

  const links = await listLinks(caller.uid);
  return NextResponse.json({
    // The partner's own read key travels with the link, so the organiser can hand it over.
    links: links.map((link) => ({ ...link, statsKey: statsKey(link.code) })),
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    code?: string;
    kind?: PartnerKind;
    partnerName?: string;
    partnerEmail?: string;
    eventId?: string;
    commissionPercent?: number;
    allocation?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // A link scoped to an event must be scoped to one this caller actually runs.
  if (body.eventId) {
    if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    const snap = await getAdminDb().collection('events').doc(body.eventId).get();
    if (!snap.exists || snap.data()?.organizerId !== caller.uid) {
      return NextResponse.json({ error: 'That is not your event.' }, { status: 403 });
    }
  }

  const result = await createLink({
    code: String(body.code ?? ''),
    kind: KINDS.includes(body.kind as PartnerKind) ? (body.kind as PartnerKind) : 'affiliate',
    partnerName: String(body.partnerName ?? ''),
    partnerEmail: String(body.partnerEmail ?? ''),
    organizerId: caller.uid,
    eventId: body.eventId,
    commissionPercent: Number(body.commissionPercent ?? 0),
    allocation: body.allocation ? Number(body.allocation) : undefined,
  });

  return result.ok
    ? NextResponse.json({ ok: true, link: result.link, statsUrl: result.statsUrl })
    : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Pausing a link. Never deleting one — its attributions are an audit trail of money owed. */
export async function PATCH(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: { code?: string; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const ok = await setActive(String(body.code ?? ''), caller.uid, body.active !== false);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'That link could not be updated.' }, { status: 404 });
}
