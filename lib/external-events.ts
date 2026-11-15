import { getExternalEvents, type ExternalEvent } from "./icloud";
import { getMacCalendarEvents } from "./mac-calendar";

/**
 * Two sources, tried in order. The Mac's own Calendar store comes first: it
 * holds every account the user added to Calendar and needs no password. The
 * iCloud connection is the fallback for when that can't be read (a web deploy,
 * or Calendar access not granted). They are never merged, because iCloud is
 * normally one of the Mac's accounts and every event would show twice.
 *
 * Every way a source can let us down — unset credentials, a bad app-specific
 * password, a network blip, a CalDAV error — collapses to the same shape here,
 * so the UI has exactly one degraded state to render instead of five.
 */
export type ExternalEventsResult = { events: ExternalEvent[]; ok: boolean };

const DEGRADED: ExternalEventsResult = { events: [], ok: false };

const TTL_MS = 5 * 60 * 1000;
/** Reading the Mac's store is local and cheap, so an event added in Calendar shows up soon. */
const MAC_TTL_MS = 30 * 1000;
/** Bounded so a long-lived instance can't accumulate a month key per navigation. */
const MAX_ENTRIES = 50;

const cache = new Map<string, { expires: number; data: ExternalEventsResult }>();

export function __resetCacheForTests(): void {
  cache.clear();
}

/**
 * Best-effort caching only: it lives in the module, so a cold serverless
 * instance simply refetches. It exists to stop rapid month-flipping from
 * hammering iCloud, not to guarantee anything.
 *
 * `fetcher` and `mac` are parameters so tests can drive every branch without
 * touching the network, the Mac's Calendar or a mocking framework.
 */
export async function loadExternalEvents(
  startISO: string,
  endISO: string,
  fetcher: (start: string, end: string) => Promise<ExternalEvent[]> = getExternalEvents,
  mac: (start: string, end: string) => Promise<ExternalEvent[] | null> = getMacCalendarEvents,
): Promise<ExternalEventsResult> {
  const key = `${startISO}|${endISO}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const remember = (data: ExternalEventsResult, ttl: number) => {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, { expires: Date.now() + ttl, data });
    return data;
  };

  try {
    const events = await mac(startISO, endISO);
    if (events) return remember({ events, ok: true }, MAC_TTL_MS);
  } catch (error) {
    console.error("Mac Calendar read failed", error);
  }

  if (!process.env.ICLOUD_APPLE_ID || !process.env.ICLOUD_APP_PASSWORD) return DEGRADED;

  try {
    // Failures are deliberately not cached, so a transient blip clears itself
    // on the next navigation rather than sticking around for five minutes.
    return remember({ events: await fetcher(startISO, endISO), ok: true }, TTL_MS);
  } catch (error) {
    console.error("iCloud calendar fetch failed", error);
    return DEGRADED;
  }
}
