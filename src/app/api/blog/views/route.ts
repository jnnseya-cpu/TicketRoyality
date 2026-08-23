import { NextResponse } from 'next/server';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { publishedSlugs } from '@/shared/content/articles';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Blog article view counts.
 *
 * The article pages are prerendered at build time, so the count lives in Firestore
 * (`article_views/{slug}`) and is read and bumped from the browser — a static page
 * cannot count its own readers.
 *
 * `POST` increments — only for a slug that is actually a published article, so the
 * collection cannot be filled with junk documents by anyone with curl. One increment
 * per browser session is enforced client-side; that is a politeness, not a defence,
 * and it does not need to be one: the number feeds curiosity and content decisions,
 * not money. `GET` returns the count, zero for the never-read.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!publishedSlugs().has(slug)) {
    return NextResponse.json({ error: 'No such article.' }, { status: 404 });
  }
  if (!isAdminConfigured()) return NextResponse.json({ views: 0 });

  try {
    const snap = await getAdminDb().collection('article_views').doc(slug).get();
    return NextResponse.json(
      { views: Number(snap.data()?.count ?? 0) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // A count that cannot be read is a zero, never an error page.
    return NextResponse.json({ views: 0 });
  }
}

export async function POST(request: Request) {
  let body: { slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!publishedSlugs().has(slug)) {
    return NextResponse.json({ error: 'No such article.' }, { status: 404 });
  }
  if (!isAdminConfigured()) return NextResponse.json({ ok: true, views: 0 });

  try {
    const ref = getAdminDb().collection('article_views').doc(slug);
    // Atomic: two simultaneous readers both count. set+merge creates the document on
    // the first-ever view without a read-modify-write race.
    await ref.set(
      { count: FieldValue.increment(1), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    const snap = await ref.get();
    return NextResponse.json({ ok: true, views: Number(snap.data()?.count ?? 1) });
  } catch {
    return NextResponse.json({ ok: false, views: 0 });
  }
}
