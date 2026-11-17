// Pure presence log: remembers when the Mac was locked or asleep, whether or
// not a timer is running. This is evidence only. It never decides what the
// user was doing; the gap form offers these times as hints the user can tap.
// No Electron import, no timers, no fs. The main process passes read/write.
const MIN_SPAN_SECONDS = 60;
const MERGE_GAP_SECONDS = 120;
const RETENTION_DAYS = 14;
const KINDS = new Set(["lock", "suspend"]);

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

/** Whatever `read()` returned, reduced to well-formed spans in time order. */
function cleanSpans(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.spans)) return [];
  return data.spans
    .filter((s) => s && validDate(s.from) && validDate(s.to) && KINDS.has(s.kind))
    .filter((s) => new Date(s.from).getTime() < new Date(s.to).getTime())
    .map((s) => ({ from: s.from, to: s.to, kind: s.kind }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

function createPresenceLog({ read, write }) {
  let spans = null;
  let openFrom = null;
  let openKind = null;

  function load() {
    if (spans === null) {
      let data = null;
      try {
        data = read();
      } catch {
        data = null;
      }
      spans = cleanSpans(data);
    }
    return spans;
  }

  return {
    /** The Mac went away (locked or asleep). An earlier open span keeps its start. */
    away(now, kind) {
      if (openFrom) return;
      openFrom = now;
      openKind = KINDS.has(kind) ? kind : "lock";
    },

    /** The Mac came back. Returns the stored (or extended) span, or null if nothing was stored. */
    back(now) {
      const from = openFrom;
      const kind = openKind;
      openFrom = null;
      openKind = null;
      if (!from) return null;
      if ((now.getTime() - from.getTime()) / 1000 < MIN_SPAN_SECONDS) return null;

      const list = load();
      const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const kept = list.filter((s) => new Date(s.to).getTime() >= cutoff);

      const last = kept[kept.length - 1];
      let stored;
      if (last && (from.getTime() - new Date(last.to).getTime()) / 1000 < MERGE_GAP_SECONDS) {
        // A brief wake during sleep: one span, the earlier span's kind.
        stored = { from: last.from, to: now.toISOString(), kind: last.kind };
        kept[kept.length - 1] = stored;
      } else {
        stored = { from: from.toISOString(), to: now.toISOString(), kind };
        kept.push(stored);
      }

      spans = kept;
      try {
        write({ version: 1, spans });
      } catch {
        // Losing a hint is harmless; never let it break lock/unlock handling.
      }
      return stored;
    },

    /** Stored spans overlapping [fromISO, toISO), ascending by start. */
    spansBetween(fromISO, toISO) {
      if (!validDate(fromISO) || !validDate(toISO)) return [];
      const fromMs = new Date(fromISO).getTime();
      const toMs = new Date(toISO).getTime();
      return load()
        .filter((s) => new Date(s.from).getTime() < toMs && new Date(s.to).getTime() > fromMs)
        .map((s) => ({ ...s }));
    },
  };
}

module.exports = { createPresenceLog, MIN_SPAN_SECONDS, MERGE_GAP_SECONDS, RETENTION_DAYS };
