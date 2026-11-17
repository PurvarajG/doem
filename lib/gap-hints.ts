import { fmtClock } from "./format";
import type { Gap, PresenceSpan, TrackingSettings } from "./types";

/** A time the gap form offers as a cut point. Tapping it is the only way it changes anything. */
export type GapHint = { at: string; label: string };

const MINUTE = 60_000;
const MAX_HINTS = 5;
const MAX_SPANS = 2;

const LABELS: Record<PresenceSpan["kind"], [string, string]> = {
  lock: ["Mac locked", "Mac unlocked"],
  suspend: ["Mac asleep", "Mac woke"],
};

function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE) * MINUTE;
}

/**
 * Evidence inside a gap, as tappable cut points: the start and end of the two
 * longest lock/sleep spans, plus the usual wake time. Only times at least a
 * minute inside both gap edges are offered, at most one per minute (a presence
 * hint beats the usual-wake hint, an earlier span beats a later one).
 */
export function gapHints(gap: Gap, spans: PresenceSpan[], settings: TrackingSettings, dayISO: string): GapHint[] {
  const gapStart = new Date(gap.startedAt).getTime();
  const gapEnd = new Date(gap.endedAt).getTime();
  const minSpan = settings.minGapMinutes * MINUTE;

  const kept = spans
    .map((s) => ({ ...s, fromMs: new Date(s.from).getTime(), toMs: new Date(s.to).getTime() }))
    .filter((s) => s.fromMs < gapEnd && s.toMs > gapStart && s.toMs - s.fromMs >= minSpan)
    .sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs))
    .slice(0, MAX_SPANS)
    .sort((a, b) => a.fromMs - b.fromMs);

  const candidates: { ms: number; label: string }[] = [];
  for (const s of kept) {
    const [awayLabel, backLabel] = LABELS[s.kind];
    candidates.push({ ms: floorToMinute(s.fromMs), label: awayLabel });
    candidates.push({ ms: floorToMinute(s.toMs), label: backLabel });
  }
  const [y, m, d] = dayISO.split("-").map(Number);
  candidates.push({ ms: new Date(y, m - 1, d, settings.wakingStartHour, 0, 0, 0).getTime(), label: "Usual wake" });

  const seen = new Set<number>();
  const hints: { ms: number; label: string }[] = [];
  for (const c of candidates) {
    if (c.ms < gapStart + MINUTE || c.ms > gapEnd - MINUTE) continue;
    if (seen.has(c.ms)) continue;
    seen.add(c.ms);
    hints.push(c);
  }

  return hints
    .sort((a, b) => a.ms - b.ms)
    .slice(0, MAX_HINTS)
    .map((h) => ({ at: new Date(h.ms).toISOString(), label: `${h.label} ${fmtClock(new Date(h.ms))}` }));
}
