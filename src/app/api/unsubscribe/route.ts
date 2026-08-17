import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe (RFC 8058).
 *
 * `POST` is what Gmail and Yahoo call when the recipient clicks their built-in
 * unsubscribe button — the person never leaves their inbox and never sees this page.
 * Supporting it is not optional for a bulk sender: without it the mail is filed as spam
 * wholesale, and that reputation damage lands on the same mailbox that delivers tickets.
 *
 * No session is required. The token in the link is proof enough, and it authorises
 * exactly one thing: turning marketing off for one account. It cannot turn it back on,
 * read anything, or touch any other field.
 */
async function unsubscribe(uid: string | null, token: string | null) {
  if (!uid || !token) return { ok: false, status: 400 as const, error: 'missing uid or token' };

  const { verifyUnsubscribe } = await import('@/backend/comms/unsubscribe');
  if (!verifyUnsubscribe(uid, token)) {
    return { ok: false, status: 403 as const, error: 'invalid token' };
  }

  const { getAdminDb, isAdminConfigured } = await import('@/backend/firebase/admin');
  if (!isAdminConfigured()) return { ok: false, status: 503 as const, error: 'unavailable' };

  try {
    await getAdminDb()
      .collection('users')
      .doc(uid)
      .set(
        { marketing: { email: false, unsubscribedAt: new Date().toISOString() } },
        { merge: true }
      );
    return { ok: true, status: 200 as const };
  } catch (error) {
    console.error('[unsubscribe] write failed', { uid, error: String(error) });
    return { ok: false, status: 503 as const, error: 'could not save' };
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await unsubscribe(url.searchParams.get('u'), url.searchParams.get('t'));
  // Mail clients want a plain 200. They do not render a body.
  return new NextResponse(result.ok ? 'unsubscribed' : (result.error ?? 'error'), {
    status: result.status,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

/**
 * GET exists for clients that follow the header as a link rather than POSTing it.
 *
 * It does NOT unsubscribe on its own. Some scanners and link-preview bots fetch every
 * URL in an email, and a GET that unsubscribed would opt people out who never clicked.
 * It redirects to the confirmation page instead, where a real click does the work.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = new URL('/unsubscribe', url.origin);
  to.searchParams.set('u', url.searchParams.get('u') ?? '');
  to.searchParams.set('t', url.searchParams.get('t') ?? '');
  return NextResponse.redirect(to, { status: 303 });
}
