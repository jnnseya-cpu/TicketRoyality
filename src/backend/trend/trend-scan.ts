import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import {
  deriveSalesObservations,
  aggregateByTopic,
  scoreTopics,
  type SaleInput,
  type EventMeta,
} from '@/shared/trend/pipeline';

/**
 * The trend scan (external spec §5, §17 schedules), run by the cron. Invisible and
 * server-side: it reads the platform's own first-party sales, writes normalised
 * observations, scores each topic and stores opportunity snapshots. It changes NOTHING a
 * user or an agent sees on its own — the snapshots are only read later by the
 * brief-production step, which is itself approval-gated and internal.
 *
 * Idempotent by window: an observation's id is derived from its source/topic/market/window,
 * so a re-run overwrites the same week with the latest count rather than inflating it. A
 * snapshot is one active row per (topic, market).
 */

export const OBSERVATIONS_COLLECTION = 'observations';
export const SNAPSHOTS_COLLECTION = 'opportunity_snapshots';

const LOOKBACK_WEEKS = 10;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DOC_ID_SAFE = /[^A-Za-z0-9_\-:.]/g;

/** Firestore batches cap at 500 writes; commit in safe chunks. */
async function commitChunked(
  db: FirebaseFirestore.Firestore,
  docs: { id: string; data: Record<string, unknown> }[],
  collection: string
): Promise<void> {
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 450)) {
      batch.set(db.collection(collection).doc(d.id), d.data);
    }
    await batch.commit();
  }
}

export interface TrendScanResult {
  observations: number;
  topics: number;
  snapshots: number;
}

export async function runTrendScan(now = Date.now()): Promise<TrendScanResult> {
  if (!isAdminConfigured()) return { observations: 0, topics: 0, snapshots: 0 };
  const db = getAdminDb();

  // Category/market for every event, to map a sale's eventId to a topic.
  const eventsSnap = await db.collection('events').get();
  const eventsById = new Map<string, EventMeta>();
  for (const doc of eventsSnap.docs) {
    const data = doc.data();
    if (data.category) {
      eventsById.set(doc.id, {
        category: String(data.category),
        market: data.country ? String(data.country) : undefined,
      });
    }
  }

  // Completed sales inside the lookback window. The derive step re-checks status and window.
  const cutoffIso = new Date(now - LOOKBACK_WEEKS * WEEK).toISOString();
  const ticketsSnap = await db.collection('tickets').where('purchasedAt', '>=', cutoffIso).get();
  const sales: SaleInput[] = ticketsSnap.docs.map((doc) => {
    const t = doc.data();
    return {
      eventId: String(t.eventId ?? ''),
      purchasedAt: String(t.purchasedAt ?? ''),
      status: String(t.status ?? ''),
    };
  });

  const observations = deriveSalesObservations(sales, eventsById, now, LOOKBACK_WEEKS);
  await commitChunked(
    db,
    observations.map((o) => ({
      id: `${o.source_id}__${o.topic}__${o.market}__${o.window_start}`.replace(DOC_ID_SAFE, '_'),
      data: o as unknown as Record<string, unknown>,
    })),
    OBSERVATIONS_COLLECTION
  );

  const series = aggregateByTopic(observations, now);
  const snapshots = scoreTopics(series, now);
  await commitChunked(
    db,
    snapshots.map((s) => ({
      id: `${s.topic}__${s.market}`.replace(DOC_ID_SAFE, '_'),
      data: s as unknown as Record<string, unknown>,
    })),
    SNAPSHOTS_COLLECTION
  );

  return { observations: observations.length, topics: series.length, snapshots: snapshots.length };
}
