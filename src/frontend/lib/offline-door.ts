'use client';

import type { OfflineManifest, QueuedRedemption } from '@/shared/tickets/offline';

/**
 * The door's local store.
 *
 * ## Why IndexedDB and not localStorage
 *
 * A stadium manifest is tens of thousands of tickets with a seed each — megabytes.
 * `localStorage` caps around five and is synchronous, so writing it would block the
 * scanner's own render loop between scans. Losing a queued redemption because the store
 * was full is losing the record that somebody was admitted.
 *
 * ## The queue is the source of truth until it drains
 *
 * A redemption is written locally **before** the door says "admit", and removed only once
 * the server confirms it. Any other order loses admissions on a dropped tab, and a lost
 * admission is a person counted as absent who is standing in the room.
 */

const DB_NAME = 'tr-door';
const DB_VERSION = 1;
const MANIFESTS = 'manifests';
const QUEUE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS, { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains(QUEUE)) {
        // Keyed by ticket, so one device cannot queue the same admission twice however
        // many times a code is waved at it.
        db.createObjectStore(QUEUE, { keyPath: 'ticketId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveManifest(manifest: OfflineManifest): Promise<void> {
  await withStore(MANIFESTS, 'readwrite', (s) => s.put(manifest));
}

export async function loadManifest(eventId: string): Promise<OfflineManifest | null> {
  try {
    return (await withStore<OfflineManifest | undefined>(MANIFESTS, 'readonly', (s) => s.get(eventId))) ?? null;
  } catch {
    return null;
  }
}

export async function clearManifest(eventId: string): Promise<void> {
  try {
    await withStore(MANIFESTS, 'readwrite', (s) => s.delete(eventId));
  } catch {
    // Nothing to clear is not a failure.
  }
}

/** Written before the door says admit. See the header. */
export async function queueRedemption(entry: QueuedRedemption): Promise<void> {
  await withStore(QUEUE, 'readwrite', (s) => s.put(entry));
}

export async function readQueue(eventId: string): Promise<QueuedRedemption[]> {
  try {
    const all = await withStore<QueuedRedemption[]>(QUEUE, 'readonly', (s) => s.getAll());
    return (all ?? []).filter((entry) => entry.eventId === eventId);
  } catch {
    return [];
  }
}

/** Removed only once the server has confirmed it. */
export async function clearQueued(ticketIds: string[]): Promise<void> {
  for (const id of ticketIds) {
    try {
      await withStore(QUEUE, 'readwrite', (s) => s.delete(id));
    } catch {
      // Left in place, and retried on the next sync.
    }
  }
}

/**
 * A stable id for this device, so a conflict names which door admitted first.
 *
 * Random and local — it identifies a phone in an organiser's own staff list, not a
 * person, and it never leaves the organiser's own data.
 */
export function deviceId(): string {
  const key = 'tr:door-device';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `door-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export function isOfflineSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}
