import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import {
  createConnectedAccount,
  createOnboardingLink,
  getConnectedAccountStatus,
  isConnectConfigured,
} from '@/backend/payments/stripe-connect';
import type { UserProfile } from '@/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe Connect onboarding for an organiser.
 *
 * `GET` reports where their connected account stands (so the dashboard can show "connect a
 * payout account" vs "ready"). `POST` creates the account if needed and returns a fresh
 * hosted onboarding link. Both refuse cleanly when Connect is not enabled — no account is
 * created and the caller is told payouts are not switched on yet.
 */

async function profileOf(uid: string): Promise<UserProfile | undefined> {
  const snap = await getAdminDb().collection('users').doc(uid).get();
  return snap.exists ? (snap.data() as UserProfile) : undefined;
}

export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  if (!isConnectConfigured()) {
    return NextResponse.json({ enabled: false, connected: false, payoutsEnabled: false });
  }

  const profile = await profileOf(caller.uid);
  if (!profile?.stripeConnectId) {
    return NextResponse.json({ enabled: true, connected: false, payoutsEnabled: false });
  }

  const status = await getConnectedAccountStatus(profile.stripeConnectId);
  if (!status.ok) return NextResponse.json({ enabled: true, connected: true, payoutsEnabled: false });

  // Keep the mirrored flag on the profile fresh, so settlement can read it without a Stripe
  // round-trip on every payout.
  if (Boolean(profile.stripeConnectPayoutsEnabled) !== status.status.payoutsEnabled) {
    await getAdminDb()
      .collection('users')
      .doc(caller.uid)
      .update({ stripeConnectPayoutsEnabled: status.status.payoutsEnabled });
  }

  return NextResponse.json({
    enabled: true,
    connected: true,
    payoutsEnabled: status.status.payoutsEnabled,
    detailsSubmitted: status.status.detailsSubmitted,
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  if (!isConnectConfigured()) {
    return NextResponse.json({ error: 'Payouts are not enabled yet.' }, { status: 503 });
  }

  const profile = await profileOf(caller.uid);
  let accountId = profile?.stripeConnectId;

  if (!accountId) {
    const created = await createConnectedAccount({
      email: caller.email,
      metadata: { organiserId: caller.uid },
    });
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: 502 });
    accountId = created.accountId;
    await getAdminDb().collection('users').doc(caller.uid).update({ stripeConnectId: accountId });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const link = await createOnboardingLink({
    accountId,
    refreshUrl: `${site}/dashboard/organiser/revenue?connect=refresh`,
    returnUrl: `${site}/dashboard/organiser/revenue?connect=done`,
  });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 502 });

  return NextResponse.json({ url: link.url });
}
