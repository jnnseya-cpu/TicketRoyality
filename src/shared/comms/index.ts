import { COMMS_CATALOGUE } from '@/shared/comms/catalogue';
import type { Channel, CommsEvent, Severity } from '@/shared/comms/types';

export * from '@/shared/comms/types';
export { COMMS_CATALOGUE } from '@/shared/comms/catalogue';

const BY_KEY = new Map<string, CommsEvent>(
  COMMS_CATALOGUE.flatMap((category) => category.events.map((e) => [e.key, e]))
);

export function findEvent(key: string): CommsEvent | undefined {
  return BY_KEY.get(key);
}

export function allEvents(): CommsEvent[] {
  return [...BY_KEY.values()];
}

export const CHANNELS: Channel[] = ['email', 'inapp', 'sms', 'push', 'whatsapp'];

export interface CatalogueStats {
  categories: number;
  events: number;
  mandatory: number;
  byChannel: Record<Channel, number>;
  bySeverity: Record<Severity, number>;
}

export function catalogueStats(): CatalogueStats {
  const events = allEvents();
  const byChannel = Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Record<Channel, number>;
  const bySeverity: Record<Severity, number> = { info: 0, success: 0, warning: 0, critical: 0 };

  for (const event of events) {
    for (const channel of event.channels) byChannel[channel] += 1;
    bySeverity[event.severity] += 1;
  }

  return {
    categories: COMMS_CATALOGUE.length,
    events: events.length,
    mandatory: events.filter((e) => e.mandatory).length,
    byChannel,
    bySeverity,
  };
}

/** Fills {{token}} placeholders. Unknown tokens are left visible rather than blanked —
 *  an empty subject line is harder to notice in QA than a literal {{event}}. */
export function render(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
    token in vars ? String(vars[token]) : match
  );
}

/**
 * Resolves which channels actually fire for a recipient.
 *
 * A mandatory event ignores preferences entirely — that is the whole meaning of the
 * flag, and it is why docs/04 M10 forbids marketing content inside one. Everything
 * else intersects the event's channels with what the recipient agreed to.
 */
export function resolveChannels(
  event: CommsEvent,
  preferences: Partial<Record<Channel, boolean>> = {}
): Channel[] {
  if (event.mandatory) return event.channels;
  return event.channels.filter((channel) => preferences[channel] !== false);
}
