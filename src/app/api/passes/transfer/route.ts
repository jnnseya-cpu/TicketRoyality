import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import {
  acceptPassTransfer,
  cancelPassTransfer,
  getPass,
  passesForUser,
  startPassTransfer,
} from '@/backend/services/season-passes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Whole-pass transfer — the sports card's "Not yet". Same three verbs as a single
 * ticket's transfer, same verified-token identity, but one link moves every remaining
 * fixture at once. All decisions live in `season-passes.ts`, in transactions.
 */
/** The caller's passes with what remains on each — the sender's side of the feature. */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const held = await passesForUser(caller.uid);
  const passes = await Promise.all(
    held.map(async (entry) => {
      const pass = await getPass(entry.passId);
      return pass
        ? { passId: entry.passId, name: pass.name, fixtures: pass.eventIds.length }
        : null;
    })
  );

  return NextResponse.json({ passes: passes.filter(Boolean) });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    action?: 'start' | 'accept' | 'cancel';
    passId?: string;
    transferId?: string;
    token?: string;
    toEmail?: string;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (body.action === 'start') {
    const result = await startPassTransfer(
      String(body.passId ?? ''),
      caller.uid,
      String(body.toEmail ?? '')
    );
    return result.ok
      ? NextResponse.json(result)
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'accept') {
    const result = await acceptPassTransfer(
      String(body.transferId ?? ''),
      String(body.token ?? ''),
      caller.uid,
      String(body.name ?? caller.email ?? 'Pass holder').slice(0, 120),
      caller.email ?? ''
    );
    return result.ok
      ? NextResponse.json(result)
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.action === 'cancel') {
    const ok = await cancelPassTransfer(String(body.transferId ?? ''), caller.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Could not cancel that transfer.' }, { status: 409 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
