import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import { deleteMedia, listMedia, mediaUsage, recordUpload } from '@/backend/services/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The media library index.
 *
 * Bytes never come through here — the browser uploads straight to Storage, where the
 * rules enforce owner, type and size at the service. This records what landed so it can
 * be listed, reused and safely deleted.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  return NextResponse.json({
    items: await listMedia(caller.uid),
    usage: await mediaUsage(caller.uid),
  });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    url?: string;
    path?: string;
    name?: string;
    width?: number;
    height?: number;
    bytes?: number;
    contentType?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const id = await recordUpload({
    // Always the caller. A path naming somebody else was already refused by Storage, and
    // is refused again here rather than trusted.
    organizerId: caller.uid,
    url: String(body.url ?? ''),
    path: String(body.path ?? ''),
    name: String(body.name ?? 'Image').slice(0, 120),
    width: Number(body.width) || 0,
    height: Number(body.height) || 0,
    bytes: Number(body.bytes) || 0,
    contentType: String(body.contentType ?? 'image/webp'),
  });

  return id
    ? NextResponse.json({ ok: true, id })
    : NextResponse.json({ error: 'Could not record that upload.' }, { status: 400 });
}

export async function DELETE(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  const result = await deleteMedia(id, caller.uid);

  if (result.ok) return NextResponse.json({ ok: true });

  return NextResponse.json(
    {
      error:
        result.reason === 'in-use'
          ? `Still used by ${result.usedBy?.join(', ')}. Change those events first.`
          : 'That image could not be deleted.',
      usedBy: result.usedBy,
    },
    { status: result.reason === 'in-use' ? 409 : 403 }
  );
}
