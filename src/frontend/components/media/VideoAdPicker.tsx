'use client';

import * as React from 'react';
import { Film, Link2, Loader2, Trash2, Upload, Youtube } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { useToast } from '@/frontend/hooks/use-toast';
import { ACCEPTED_VIDEO, uploadVideo } from '@/frontend/lib/media';
import { parseVideoAd } from '@/shared/video';

/**
 * Attach a promotional video for the homepage spotlight strip — three ways in, one field
 * out (`videoAdUrl`):
 *
 * 1. Upload an MP4/WebM straight to Storage (needs the storage rule deployed).
 * 2. Paste a direct video link (an .mp4/.webm on any host).
 * 3. Paste a YouTube link — the one that needs no upload and no rule at all, so it works
 *    the moment this ships.
 *
 * The homepage decides how to play whatever URL lands here via `parseVideoAd`, so the
 * picker only has to store the string.
 */
export function VideoAdPicker({
  organiserId,
  value,
  onChange,
}: {
  organiserId: string;
  value?: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadVideo(organiserId, file);
      onChange(uploaded.url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Video not uploaded',
        // The Storage rule rejects the upload until it is deployed — say so, since it is
        // the one failure a paste-a-link avoids entirely.
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    const url = draft.trim();
    if (!url) return;
    // A light sanity check; parseVideoAd accepts anything, so guard the obvious paste slip.
    if (!/^https?:\/\//i.test(url)) {
      toast({
        variant: 'destructive',
        title: 'That is not a link',
        description: 'Paste a full https:// video or YouTube URL.',
      });
      return;
    }
    onChange(url);
    setDraft('');
  };

  const ad = parseVideoAd(value);

  return (
    <div className="space-y-3">
      {ad ? (
        <div className="flex flex-wrap items-center gap-3">
          {ad.kind === 'youtube' ? (
            <div className="relative h-20 w-36 overflow-hidden rounded-md border border-border">
              {/* A still thumbnail, not an embed — a form does not need a playing iframe. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ad.thumbnail} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                <Youtube className="h-3 w-3" /> YouTube
              </span>
            </div>
          ) : (
            <video
              src={ad.url}
              className="h-20 w-36 rounded-md border border-border object-cover"
              muted
              playsInline
              onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
              onMouseLeave={(e) => e.currentTarget.pause()}
            />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')} disabled={uploading}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Upload a video
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">or paste a link</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="YouTube link, or a direct .mp4/.webm URL"
                className="pl-9"
              />
            </div>
            <Button type="button" variant="secondary" onClick={addLink} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO.join(',')}
        className="sr-only"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Film className="h-3 w-3" />
        A YouTube link works right away. An uploaded MP4/WebM (up to 50MB) needs the Storage
        rule deployed. It plays muted and looping in the homepage spotlight while a Spotlight
        placement is active; the cover picture shows if there is no video.
      </p>
    </div>
  );
}
