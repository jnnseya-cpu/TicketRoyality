import 'server-only';

/**
 * Error reporting, through Google Cloud Error Reporting.
 *
 * No new vendor. Sentry would be a sixth account (`CLAUDE.md` §1) and Error Reporting is
 * already in the project — the only thing missing was emitting errors in the shape it
 * recognises.
 *
 * ## Why the shape matters
 *
 * Error Reporting groups a log entry as an error when it carries a `stack_trace`, a
 * `severity` of ERROR or above, and a `@type` marking it as a reported error event.
 * A bare `console.error('it broke')` lands in Cloud Logging as text and is never grouped,
 * counted, or alertable — which is exactly the state the platform was in: every failure
 * path logged carefully, and none of them visible as an *error* anywhere.
 *
 * ## What must never go in
 *
 * Error Reporting entries are retained and readable by anyone with project access, so
 * this strips the payload down to a context object the caller chooses explicitly. There
 * is no "log the whole request" convenience here on purpose — that is how a card number,
 * a bearer token or an attendee list ends up in a monitoring tool.
 */

export interface ErrorContext {
  /** Where it happened — `checkout`, `issuance`, `redeem`. Becomes the grouping hint. */
  scope: string;
  /** Safe identifiers only. Never a token, never a full request body. */
  [key: string]: string | number | boolean | undefined;
}

const SENSITIVE = /(?:key|secret|token|password|authorization|cookie|card|cvv|iban)/i;

/** Drops anything whose name suggests a credential, whatever the caller passed. */
function scrub(context: ErrorContext): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE.test(k)) {
      safe[k] = '[redacted]';
      continue;
    }
    safe[k] = typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v;
  }
  return safe;
}

/**
 * Report an error so it is grouped, counted and alertable.
 *
 * Never throws. A monitoring call that takes down the request it was observing is worse
 * than no monitoring at all.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));

    // Structured JSON on stdout is how Cloud Run ingests logs. The `@type` is what
    // promotes this from a log line to a tracked error.
    const entry = {
      severity: 'ERROR',
      '@type': 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent',
      message: `${err.message}\n${err.stack ?? ''}`,
      stack_trace: err.stack,
      serviceContext: {
        service: process.env.K_SERVICE ?? 'ticketroyality',
        version: process.env.K_REVISION ?? 'local',
      },
      context: scrub(context),
    };

    console.error(JSON.stringify(entry));
  } catch {
    // Reporting must not become the failure.
  }
}
