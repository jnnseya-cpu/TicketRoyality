'use client';

import * as React from 'react';
import Image from 'next/image';
import { Camera, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

import { Button } from '@/frontend/components/ui/button';
import { useToast } from '@/frontend/hooks/use-toast';
import { isFirebaseConfigured, storage } from '@/shared/firebase/client';
import { updateUserProfile } from '@/shared/data/repositories';
import { accountDisplayName, cn } from '@/shared/utils';
import type { UserProfile } from '@/shared/types';

/**
 * Profile photo and cover image, for every account type.
 *
 * `logoUrl` and `coverUrl` already existed on `UserProfile` but were organiser-only,
 * set once as typed URLs during registration and never editable afterwards. A customer
 * had no picture at all, and neither did an administrator. Those two field names are
 * kept rather than renamed — the organiser directory, the public profile projection,
 * the event host card and the JSON-LD all read them, and a rename would be a migration
 * with nothing to gain.
 *
 * Two things happen before an upload that are worth being deliberate about:
 *
 *   1. The image is downscaled in the browser. A photo straight off a phone is 3-6 MB;
 *      as a 96px avatar that is pure waste — slow to upload on mobile data, slow to
 *      render for every visitor, and the most common cause of hitting the 5 MB storage
 *      rule. Resizing first means the size limit is never reached by accident.
 *   2. The previous file is deleted after the new URL is saved, not before. If the
 *      upload fails the old picture is still there and still referenced.
 */

/** Matches the ceiling in `storage.rules`. Checked here so the failure is a message. */
const MAX_BYTES = 5 * 1024 * 1024;

const SPECS = {
  avatar: { maxEdge: 512, label: 'Profile photo' },
  cover: { maxEdge: 1600, label: 'Cover image' },
} as const;

type Kind = keyof typeof SPECS;

/**
 * Downscale to fit `maxEdge` and re-encode as JPEG. Returns the original untouched if
 * the browser cannot decode it — better a large upload than a silent failure.
 */
async function downscale(file: File, maxEdge: number): Promise<Blob> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/** The storage path from a download URL, so the old file can be removed. */
function storagePathFrom(url: string): string | null {
  const match = /\/o\/([^?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

export function ProfileMedia({
  profile,
  onSaved,
}: {
  profile: UserProfile;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<Kind | null>(null);
  const inputs = {
    avatar: React.useRef<HTMLInputElement>(null),
    cover: React.useRef<HTMLInputElement>(null),
  };

  const avatarUrl = profile.logoUrl;
  const coverUrl = profile.coverUrl;

  const apply = React.useCallback(
    async (kind: Kind, url: string | undefined, previous: string | undefined) => {
      await updateUserProfile(profile.uid, kind === 'avatar' ? { logoUrl: url } : { coverUrl: url });

      // Only once the profile no longer points at it. A delete that runs first turns a
      // failed save into a profile referencing a file that is gone.
      if (previous && previous !== url) {
        const path = storagePathFrom(previous);
        if (path) {
          await deleteObject(ref(storage, path)).catch(() => {
            // The old file is orphaned rather than lost. Not worth failing the save.
          });
        }
      }
      onSaved?.();
    },
    [profile.uid, onSaved]
  );

  const upload = async (kind: Kind, file: File) => {
    if (!isFirebaseConfigured) {
      toast({
        variant: 'destructive',
        title: 'Uploads unavailable',
        description: 'This deployment has no Firebase project configured.',
      });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'That is not an image' });
      return;
    }

    setBusy(kind);
    try {
      const blob = await downscale(file, SPECS[kind].maxEdge);
      if (blob.size > MAX_BYTES) {
        throw new Error('That image is still over 5 MB after resizing. Try a smaller one.');
      }

      // The filename carries the kind and a timestamp so a re-upload never collides
      // with a cached copy of the previous one at the same URL.
      const name = `${kind}-${Date.now()}.jpg`;
      const target = ref(storage, `users/${profile.uid}/${name}`);
      await uploadBytes(target, blob, { contentType: blob.type || 'image/jpeg' });
      const url = await getDownloadURL(target);

      await apply(kind, url, kind === 'avatar' ? avatarUrl : coverUrl);
      toast({ title: `${SPECS[kind].label} updated` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: `Could not update your ${SPECS[kind].label.toLowerCase()}`,
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
      inputs[kind].current!.value = '';
    }
  };

  const remove = async (kind: Kind) => {
    setBusy(kind);
    try {
      await apply(kind, undefined, kind === 'avatar' ? avatarUrl : coverUrl);
      toast({ title: `${SPECS[kind].label} removed` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not remove it',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const initials =
    accountDisplayName(profile)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  return (
    <div className="space-y-3">
      {(['avatar', 'cover'] as const).map((kind) => (
        <input
          key={kind}
          ref={inputs[kind]}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(kind, file);
          }}
        />
      ))}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="relative h-32 bg-secondary sm:h-40">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 700px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
              <span className="text-xs">No cover image yet</span>
            </div>
          )}

          <div className="absolute right-3 top-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => inputs.cover.current?.click()}
            >
              {busy === 'cover' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              {coverUrl ? 'Change cover' : 'Add cover'}
            </Button>
            {coverUrl && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void remove('cover')}
                aria-label="Remove cover image"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 p-4">
          <div
            className={cn(
              'relative -mt-12 h-20 w-20 shrink-0 overflow-hidden rounded-full',
              'border-4 border-card bg-secondary'
            )}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={accountDisplayName(profile)}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center font-headline text-xl font-bold text-muted-foreground">
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{accountDisplayName(profile)}</p>
            <p className="text-xs text-muted-foreground">
              A square picture works best. Anything larger is resized before it is uploaded.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => inputs.avatar.current?.click()}
            >
              {busy === 'avatar' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              {avatarUrl ? 'Change photo' : 'Add photo'}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void remove('avatar')}
                aria-label="Remove profile photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
