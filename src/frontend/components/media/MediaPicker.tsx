'use client';

import * as React from 'react';
import Image from 'next/image';
import { Check, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { ACCEPTED, uploadImage } from '@/frontend/lib/media';
import { cn } from '@/shared/utils';

interface MediaItem {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Pick an image, or add one.
 *
 * ## Reuse is the point
 *
 * An organiser running a weekly night uses the same four images all year. Making them
 * find the file again every time is how event pages end up with a stock photo nobody
 * chose, and it is the reason the library exists at all rather than a plain upload field.
 *
 * Images are resized in the browser before they upload — see `lib/media.ts` — so a photo
 * straight off a phone becomes something an event page can load on venue wifi.
 */
export function MediaPicker({
  organiserId,
  value,
  onChange,
}: {
  organiserId: string;
  value?: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/media');
      const data = (await response.json()) as { items?: MediaItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadImage(organiserId, file);

      await authedFetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...uploaded, name: file.name }),
      });

      onChange(uploaded.url);
      await load();
      toast({ title: 'Image added', description: file.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not upload that image',
        description: error instanceof Error ? error.message : 'Please try another file.',
      });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    const response = await authedFetch(`/api/media?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      // "Used by these three events" is an answer somebody can act on; "cannot delete"
      // is not.
      toast({ variant: 'destructive', title: 'Still in use', description: data.error });
      return;
    }
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ImagePlus className="h-4 w-4" /> {value ? 'Change image' : 'Choose image'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Your images</DialogTitle>
          <DialogDescription>
            Reuse anything you have uploaded before, or add a new one. Large photos are resized
            here so your event page loads quickly on a phone.
          </DialogDescription>
        </DialogHeader>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="royal"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload an image
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing here yet. Upload your first image.
          </p>
        ) : (
          <div className="grid max-h-[50vh] gap-3 overflow-y-auto sm:grid-cols-3">
            {items.map((item) => {
              const selected = item.url === value;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border',
                    selected ? 'border-primary ring-2 ring-primary/40' : 'border-border'
                  )}
                >
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => {
                      onChange(item.url);
                      setOpen(false);
                    }}
                  >
                    <div className="relative aspect-video bg-muted">
                      <Image
                        src={item.url}
                        alt={item.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 240px"
                        className="object-cover"
                      />
                      {selected && (
                        <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <p className="truncate p-2 text-left text-xs text-muted-foreground">
                      {item.width}×{item.height} · {Math.round(item.bytes / 1024)} KB
                    </p>
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute bottom-1 right-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void remove(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete {item.name}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
