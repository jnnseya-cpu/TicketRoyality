'use client';

import * as React from 'react';
import { Film, Loader2, Trash2, Upload } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { useToast } from '@/frontend/hooks/use-toast';
import { ACCEPTED_VIDEO, uploadVideo } from '@/frontend/lib/media';

/**
 * Attach a promotional video for the homepage spotlight strip.
 *
 * A deliberate sibling to `MediaPicker`, not a reuse of it: the image library exists so an
 * organiser reuses the same four photos all year, whereas a promo video is bought per
 * campaign and belongs to one placement, so there is no library to browse — just an
 * upload and a preview. The upload goes straight to Storage from the browser (the
 * organiser is signed in and owns the folder `storage.rules` writes to), exactly as the
 * cover image does, so a 50MB file never passes through a Cloud Run request.
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
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadVideo(organiserId, file);
      onChange(uploaded.url);
    } catch (error) {
      // uploadVideo throws a human sentence for the two cases a person can act on
      // (wrong type, too big); anything else is a genuine upload failure.
      toast({
        variant: 'destructive',
        title: 'Video not uploaded',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
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

      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          <video
            src={value}
            className="h-20 w-36 rounded-md border border-border object-cover"
            muted
            playsInline
            // A muted, looping, mouse-over preview — enough to confirm the right clip
            // without autoplaying every video in a long form.
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            disabled={uploading}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload a video
            </>
          )}
        </Button>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Film className="h-3 w-3" />
        MP4 or WebM, up to 50MB. Plays muted and looping in the homepage spotlight while a
        Spotlight placement is active; the cover picture shows if there is no video.
      </p>
    </div>
  );
}
