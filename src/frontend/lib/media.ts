'use client';

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '@/shared/firebase/client';

/**
 * Uploading an image, from the organiser's own browser.
 *
 * ## Why the upload goes straight to Storage
 *
 * Routing an 8MB file through a Cloud Run request costs the request's whole memory budget
 * and its timeout, for no benefit: `storage.rules` already enforces the owner, the content
 * type and the size ceiling at the service, which is a stronger place to enforce it than
 * our own JavaScript. The API is told about the file afterwards so it can be listed and
 * reused; the bytes never touch it.
 *
 * ## Resized before it leaves the browser
 *
 * A photo straight off a phone is 4–12MB and is displayed at 1200px. Uploading the
 * original wastes the organiser's data, the bucket, and every subsequent page load — and
 * it is the difference between an event page that loads on venue wifi and one that does
 * not. Canvas does this in a second and needs nothing installed.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * The ceiling each folder's rule enforces, mirrored here so a refusal is a sentence
 * rather than an opaque failed upload.
 *
 * These must stay equal to `storage.rules`. A client limit that is more generous than the
 * service's is worse than none: the file uploads, the service refuses it, and the person
 * is told nothing useful.
 */
export const FOLDER_LIMITS = {
  events: 8 * 1024 * 1024,
  users: 5 * 1024 * 1024,
  organisers: 4 * 1024 * 1024,
} as const;
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Promotional video for the homepage spotlight strip.
 *
 * A video cannot be resized in the browser the way an image can, so the only defence
 * against a 400MB upload is a hard size ceiling checked here AND in `storage.rules` — the
 * two must stay equal, exactly as the image folder limits do. 50MB is enough for a
 * 15–30s promo at a sensible bitrate and small enough not to punish a phone on venue wifi;
 * the strip autoplays muted, so anything longer is wasted bytes nobody watches.
 */
export const ACCEPTED_VIDEO = ['video/mp4', 'video/webm'];
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Upload a promo video straight to Storage (no re-encode) and return its URL + path. */
export async function uploadVideo(organiserId: string, file: File): Promise<UploadedImage> {
  if (!ACCEPTED_VIDEO.includes(file.type)) {
    throw new Error('Use an MP4 or WebM video.');
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(
      `That video is ${Math.round(file.size / 1024 / 1024)}MB. The limit is ${VIDEO_MAX_BYTES / 1024 / 1024}MB — trim it to a short clip.`
    );
  }

  const extension = file.type.split('/')[1] ?? 'mp4';
  const name = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const path = `events/${organiserId}/${name}`;

  const location = ref(storage, path);
  await uploadBytes(location, file, { contentType: file.type });

  return {
    url: await getDownloadURL(location),
    path,
    // Videos have no still dimensions we need to record; 0 keeps the shared shape.
    width: 0,
    height: 0,
    bytes: file.size,
    contentType: file.type,
  };
}

/** Wide enough for a hero at 2× on a laptop; small enough to load on a phone. */
const MAX_EDGE = 2000;
const QUALITY = 0.85;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
}

/**
 * Shrink to fit, keeping the aspect ratio. Never enlarges — upscaling a small logo
 * produces a bigger file that looks worse, which is the wrong trade twice over.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP or AVIF image.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Already small enough, and already a sensible format: leave it alone rather than
  // re-encoding, which only ever loses quality.
  if (scale === 1 && file.size <= 1_500_000) {
    bitmap.close();
    return { blob: file, width, height, contentType: file.type };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { blob: file, width, height, contentType: file.type };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    // WebP everywhere it is supported: roughly a third of the bytes of JPEG at the same
    // quality, and every browser that can run this app can display it.
    canvas.toBlob(resolve, 'image/webp', QUALITY)
  );

  if (!blob) throw new Error('Could not process that image.');
  return { blob, width, height, contentType: 'image/webp' };
}

export interface UploadedImage {
  url: string;
  path: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
}

/**
 * Where an image belongs.
 *
 * Each of these is a separate rule in `storage.rules` with its own size ceiling, so the
 * folder is not decoration — writing branding into the events folder would be accepted by
 * a rule written for something else, and the ceilings would stop matching what the UI
 * promised.
 */
export type MediaFolder = 'events' | 'organisers' | 'users';

/**
 * Upload, and return what the library needs to record.
 *
 * The path is scoped to the owner because that is what `storage.rules` checks. A file
 * written anywhere else is refused by the service, not by this function.
 */
export async function uploadImage(
  organiserId: string,
  file: File,
  folder: MediaFolder = 'events'
): Promise<UploadedImage> {
  const prepared = await prepareImage(file);

  const ceiling = FOLDER_LIMITS[folder];
  if (prepared.blob.size > ceiling) {
    throw new Error(
      `That image is still ${Math.round(prepared.blob.size / 1024 / 1024)}MB after resizing. The limit here is ${Math.round(ceiling / 1024 / 1024)}MB.`
    );
  }

  const extension = prepared.contentType.split('/')[1] ?? 'webp';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const path = `${folder}/${organiserId}/${name}`;

  const location = ref(storage, path);
  await uploadBytes(location, prepared.blob, { contentType: prepared.contentType });

  return {
    url: await getDownloadURL(location),
    path,
    width: prepared.width,
    height: prepared.height,
    bytes: prepared.blob.size,
    contentType: prepared.contentType,
  };
}
