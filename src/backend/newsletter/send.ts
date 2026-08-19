import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { recordDeliveries } from '@/backend/comms/log';
import { isEmailConfigured, send } from '@/backend/comms/email';
import { unsubscribeHeaders, unsubscribeUrl } from '@/backend/comms/unsubscribe';
import { getEvents } from '@/shared/data/repositories';
import { siteUrl } from '@/shared/site';
import type { Event } from '@/shared/types';

import { buildNewsletter, eventsForNewsletter, newsletterArticles, weekIndex } from './build';

/**
 * The weekly send, in throttled batches.
 *
 * The batching is not an optimisation. Ticket email goes out through the same Hostinger
 * mailbox as this newsletter, and shared-hosting SMTP carries an hourly send cap. A
 * single blast to the whole list would hit that cap, and what breaks *after* the cap is
 * hit is not the newsletter — it is the ticket somebody just paid for. Marketing must
 * never be able to take delivery down with it.
 *
 * So one run is spread across many small invocations: the scheduler calls this every
 * fifteen minutes, each call sends at most `BATCH_SIZE`, and a cursor in
 * `newsletter_runs/{weekId}` remembers where it got to. A list of any size drains over
 * hours, well inside the limit, and the run stops by itself when it reaches the end.
 *
 * The weekId also makes the whole thing idempotent: re-running on the same week resumes
 * that week's run rather than starting a second one, so a double-scheduled job or a
 * manual trigger cannot mail anyone twice.
 */

/** Conservative on purpose — see above. Raise only with evidence from real send logs. */
const BATCH_SIZE = 25;

const COLLECTION = 'newsletter_runs';

export interface RunState {
  weekId: string;
  startedAt: string;
  /** Last uid processed. Firestore orders by document id, so this paginates stably. */
  cursor: string | null;
  sent: number;
  failed: number;
  skipped: number;
  /**
   * Paid newsletter-spotlight events, snapshotted when the run starts so every batch
   * of one week's send carries the same block — a spotlight bought mid-run waits for
   * next week rather than reaching half a list. Cleared from the events when the run
   * completes: that completion IS the "single send" the organiser paid for.
   */
  spotlightIds?: string[];
  completedAt?: string;
}

export interface SendResult {
  weekId: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  done: boolean;
  reason?: string;
}

/** Globally unique — epoch week numbers do not reset at the year boundary. */
export function currentWeekId(now: Date): string {
  return `week-${weekIndex(now)}`;
}

/**
 * The completed run consumes the paid spotlights — "single send" means exactly one
 * full run, and it has just happened. Best-effort per event: a flag that fails to
 * clear gets one more week, which errs in the paying organiser's favour.
 */
async function consumeSpotlights(
  db: ReturnType<typeof getAdminDb>,
  ids: string[]
): Promise<void> {
  for (const id of ids) {
    await db
      .collection('events')
      .doc(id)
      .update({ newsletterSpotlight: false })
      .catch(() => {});
  }
}

/**
 * Runs one batch. Never throws — it is called by a scheduler, and a thrown error
 * produces a retry that starts the batch again from a cursor that was never advanced.
 */
export async function sendNewsletterBatch(now = new Date()): Promise<SendResult> {
  const weekId = currentWeekId(now);
  const empty: SendResult = { weekId, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };

  if (!isAdminConfigured()) return { ...empty, reason: 'admin sdk not configured' };
  if (!isEmailConfigured()) return { ...empty, reason: 'smtp not configured' };

  const db = getAdminDb();
  const runRef = db.collection(COLLECTION).doc(weekId);

  let run: RunState;
  try {
    const snap = await runRef.get();
    if (snap.exists) {
      run = snap.data() as RunState;
      // Already finished this week. This is the guard that makes an extra scheduler
      // tick — or an impatient manual trigger — a no-op rather than a second mailing.
      if (run.completedAt) return { ...empty, reason: 'already completed this week' };
    } else {
      // The paid spotlight list is fixed at the moment the run starts — see RunState.
      let spotlightIds: string[] = [];
      try {
        const flagged = await db
          .collection('events')
          .where('newsletterSpotlight', '==', true)
          .get();
        spotlightIds = flagged.docs
          .filter((doc) => {
            const data = doc.data() as { status?: string; date?: string };
            // Only a published, still-upcoming event goes into an inbox with the
            // platform's name on it.
            return (
              data.status === 'published' &&
              (!data.date || new Date(data.date).getTime() > now.getTime())
            );
          })
          .map((doc) => doc.id);
      } catch {
        // No spotlight beats no newsletter.
      }
      run = {
        weekId,
        startedAt: now.toISOString(),
        cursor: null,
        sent: 0,
        failed: 0,
        skipped: 0,
        spotlightIds,
      };
      await runRef.set(run);
    }
  } catch (error) {
    return { ...empty, reason: `could not read run state: ${String(error)}` };
  }

  // Ordered by document id so the cursor is stable even as accounts are created
  // mid-run. A new account created behind the cursor simply waits for next week.
  let query = db.collection('users').orderBy('__name__').limit(BATCH_SIZE);
  if (run.cursor) query = query.startAfter(run.cursor);

  let users;
  try {
    users = await query.get();
  } catch (error) {
    return { ...empty, reason: `could not read recipients: ${String(error)}` };
  }

  if (users.empty) {
    await runRef.update({ completedAt: now.toISOString() }).catch(() => {});
    await consumeSpotlights(db, run.spotlightIds ?? []);
    return { ...empty, reason: 'run complete' };
  }

  const base = siteUrl();
  const articles = newsletterArticles(now);
  const allEvents = await getEvents({ max: 60 }).catch(() => []);
  const events = eventsForNewsletter(allEvents, now);

  // The paid spotlight block, from the ids frozen when the run started.
  const spotlightIds = run.spotlightIds ?? [];
  let spotlight: Event[] = [];
  if (spotlightIds.length) {
    try {
      const snaps = await Promise.all(
        spotlightIds.map((id) => db.collection('events').doc(id).get())
      );
      spotlight = snaps
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...(snap.data() as object) }) as Event);
    } catch {
      // The paid block failing to load must not stop the send; the flag stays set, so
      // the next completed run still delivers what was bought.
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const records = [];
  let lastId = run.cursor;

  for (const doc of users.docs) {
    lastId = doc.id;
    const profile = doc.data() as {
      email?: string;
      fullName?: string;
      marketing?: { email?: boolean };
    };

    // Explicit false only. Absent means "never asked", which is the soft opt-in
    // position for an existing customer — and the unsubscribe link in every one of
    // these is what keeps that lawful.
    if (profile.marketing?.email === false) {
      skipped += 1;
      continue;
    }
    if (!profile.email || !profile.email.includes('@')) {
      skipped += 1;
      continue;
    }

    const content = buildNewsletter({
      articles,
      events,
      spotlight,
      siteUrl: base,
      unsubscribeUrl: unsubscribeUrl(doc.id, base),
      recipientName: profile.fullName?.split(' ')[0],
    });

    const outcome = await send({
      to: profile.email,
      ...content,
      headers: unsubscribeHeaders(doc.id, base),
    });

    if (outcome.status === 'sent') sent += 1;
    else if (outcome.status === 'failed') failed += 1;
    else skipped += 1;

    records.push({
      id: '',
      eventKey: 'marketing.weekly_digest',
      channel: 'email' as const,
      recipient: profile.email,
      status: outcome.status === 'sent' ? ('sent' as const) : outcome.status === 'failed' ? ('failed' as const) : ('suppressed' as const),
      provider: 'smtp',
      at: new Date().toISOString(),
      severity: 'info',
      sandbox: false,
      ...(outcome.status !== 'sent' ? { error: outcome.reason } : {}),
    });
  }

  await recordDeliveries(records);

  const done = users.size < BATCH_SIZE;
  await runRef
    .update({
      cursor: lastId,
      sent: run.sent + sent,
      failed: run.failed + failed,
      skipped: run.skipped + skipped,
      ...(done ? { completedAt: new Date().toISOString() } : {}),
    })
    .catch(() => {});

  if (done) await consumeSpotlights(db, run.spotlightIds ?? []);

  return { weekId, processed: users.size, sent, skipped, failed, done };
}
