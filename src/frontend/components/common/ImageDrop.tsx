'use client';

import * as React from 'react';
import { ImagePlus, X } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { ACCEPTED, MAX_UPLOAD_BYTES } from '@/frontend/lib/media';
import { cn } from '@/shared/utils';

/**
 * Choose an image file, with a preview.
 *
 * ## Why this holds a File rather than uploading immediately
 *
 * On the organiser application there is no account yet, and `storage.rules` requires the
 * uploader to own the folder they are writing to — correctly, or anybody could fill the
 * bucket. So the file is held here and uploaded by the caller the moment the account
 * exists. The alternative, asking somebody to paste a URL for their own logo, is asking
 * them to go and host it somewhere else first.
 *
 * The preview is a local object URL, so it costs nothing and works offline; it is revoked
 * when it changes so a long form does not leak one per attempt.
 */
export function ImageDrop({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const take = (file: File | undefined) => {
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP or AVIF image.');
      return;
    }
    /*
     * Checked here as well as at the service. The browser can say so instantly and name
     * the actual size, where a rules rejection arrives as a failed upload with no
     * explanation a person can act on.
     */
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 8MB.`);
      return;
    }

    setError(null);
    onChange(file);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-sm font-medium">{label}</p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files?.[0]);
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = '';
        }}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* A local object URL cannot go through the image optimiser. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-28 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove {label}</span>
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            take(event.dataTransfer.files?.[0]);
          }}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-xs">Choose a file or drop one here</span>
        </button>
      )}

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
