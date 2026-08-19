import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import type { Event } from '@/shared/types';

/**
 * The public view of an organiser.
 *
 * `users` documents carry `email`, `phone`, `address` and `dateOfBirth` alongside the
 * branding fields. The organiser directory is a public, indexable page, so it must
 * never read whole profiles into a server component and hope the JSX only prints the
 * safe ones — a later edit adding `{organiser.email}` would publish a personal address
 * with no review step, and Next.js also serialises the fetched object into the RSC
 * payload sent to the browser whether it is rendered or not.
 *
 * So the projection happens here, in one place, and the type makes the private fields
 * unreachable rather than merely unused.
 */
export interface PublicOrganiser {
  uid: string;
  fullName: string;
  companyName?: string;
  bio?: string;
  website?: string;
  logoUrl?: string;
  coverUrl?: string;
  socials?: { facebook?: string; instagram?: string; twitter?: string };
}

/** Whitelist, never a blacklist. A new private field is excluded by default. */
function project(uid: string, data: Record<string, unknown>): PublicOrganiser {
  const pick = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);

  return {
    uid,
    fullName: pick('fullName') ?? 'Organiser',
    companyName: pick('companyName'),
    bio: pick('bio'),
    website: pick('website'),
    logoUrl: pick('logoUrl'),
    coverUrl: pick('coverUrl'),
    socials: (data.socials as PublicOrganiser['socials']) ?? undefined,
  };
}

/**
 * Approved organisers, for the public directory.
 *
 * Reads through the Admin SDK rather than the client SDK on purpose. `firestore.rules`
 * requires a signed-in user to *list* `users`, and that restriction is correct — an
 * anonymous list would make every organiser's contact details bulk-harvestable. The
 * directory still needs to be public and indexable, so the server does the read with
 * privileged credentials and hands back only what is safe to publish.
 *
 * Never throws. An unreachable database yields an empty directory, not a 500 on a page
 * that is otherwise fine.
 */
export async function getPublicOrganisers(): Promise<PublicOrganiser[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snapshot = await getAdminDb()
      .collection('users')
      .where('userType', '==', 'organiser')
      .where('status', '==', 'approved')
      .limit(200)
      .get();

    return snapshot.docs.map((doc) => project(doc.id, doc.data()));
  } catch (error) {
    console.error('[public-profiles] organiser directory unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * The organiser's PUBLIC events — published and publicly listed, nothing else.
 *
 * The profile page used to call the client-SDK repository from the server, which runs
 * as an anonymous reader; the security rules refuse to list an organiser's drafts and
 * cancelled events to anonymous (correctly), and that refusal threw — so the moment an
 * organiser had any non-published event, their public page was "Application error: a
 * server-side exception has occurred". The Admin SDK does the read here, and the
 * public filter is applied in code: a public page has no business showing drafts,
 * unlisted events or cancellations anyway.
 *
 * Never throws — an unreachable database yields an empty list, not a dead page.
 */
export async function getPublicOrganiserEvents(uid: string): Promise<Event[]> {
  if (!isAdminConfigured()) return [];

  try {
    const snapshot = await getAdminDb()
      .collection('events')
      .where('organizerId', '==', uid)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Event)
      .filter((event) => event.status === 'published' && event.listing !== 'unlisted')
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  } catch (error) {
    console.error('[public-profiles] organiser events unavailable', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** One approved organiser. Returns null for anyone unapproved or not an organiser. */
export async function getPublicOrganiser(uid: string): Promise<PublicOrganiser | null> {
  if (!isAdminConfigured()) return null;

  try {
    const doc = await getAdminDb().collection('users').doc(uid).get();
    if (!doc.exists) return null;

    const data = doc.data() as Record<string, unknown>;
    // A pending or suspended organiser has no public page. Publishing one would list a
    // seller the platform has not vetted.
    if (data.userType !== 'organiser' || data.status !== 'approved') return null;

    return project(doc.id, data);
  } catch (error) {
    console.error('[public-profiles] organiser lookup failed', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
