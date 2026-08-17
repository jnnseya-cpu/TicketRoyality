import { NextResponse } from 'next/server';

import { requireAdmin } from '@/backend/auth/require-admin';
import { getAdminDb } from '@/backend/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every account, for the admin console.
 *
 * Read through the Admin SDK rather than the client SDK on purpose. `firestore.rules`
 * lets a signed-in user list `users`, which is deliberately narrow — the documents carry
 * email, phone, address and date of birth. Going through a guarded route keeps the read
 * behind a verified administrator rather than behind "is signed in".
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();

  try {
    const snap = await getAdminDb().collection('users').limit(500).get();

    const users = snap.docs
      .map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        return {
          uid: doc.id,
          email: String(d.email ?? ''),
          fullName: String(d.fullName ?? ''),
          userType: String(d.userType ?? 'customer'),
          status: String(d.status ?? ''),
          companyName: d.companyName ? String(d.companyName) : undefined,
          createdAt: String(d.createdAt ?? ''),
          marketingOptOut: (d.marketing as { email?: boolean } | undefined)?.email === false,
        };
      })
      // Filtered here rather than in Firestore: the fields people search by are
      // free text, and a prefix index per field would not answer "contains".
      .filter(
        (u) =>
          !search ||
          u.email.toLowerCase().includes(search) ||
          u.fullName.toLowerCase().includes(search) ||
          (u.companyName ?? '').toLowerCase().includes(search)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const counts = users.reduce<Record<string, number>>((acc, u) => {
      acc[u.userType] = (acc[u.userType] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json(
      { users, total: users.length, counts },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin/users] read failed', { error: String(error) });
    return NextResponse.json({ error: 'Could not read accounts.' }, { status: 503 });
  }
}
