import assert from "node:assert/strict";
import test from "node:test";
import { gapHints } from "../lib/gap-hints";
import type { Gap, PresenceSpan, TrackingSettings } from "../lib/types";

const SETTINGS: TrackingSettings = {
  dayStartHour: 4,
  wakingStartHour: 7,
  wakingEndHour: 23,
  minGapMinutes: 10,
  moduleOrder: [],
  hiddenModules: [],
  collapsedModules: [],
  hiddenNavItems: [],
  updatedAt: "2026-03-01T09:00:00.000Z",
};

const DAY = "2026-11-17";

function at(dayISO: string, hour: number, minute = 0, second = 0): string {
  const [y, m, d] = dayISO.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, second).toISOString();
}

function gap(startedAt: string, endedAt: string): Gap {
  return { startedAt, endedAt, minutes: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000) };
}

const overnight = gap(at("2026-11-16", 23, 40), at(DAY, 8, 15));

test("an overnight lock gives lock, usual wake and unlock hints in time order", () => {
  const spans: PresenceSpan[] = [{ from: at("2026-11-16", 23, 52, 10), to: at(DAY, 7, 28, 40), kind: "lock" }];
  assert.deepEqual(gapHints(overnight, spans, SETTINGS, DAY), [
    { at: at("2026-11-16", 23, 52), label: "Mac locked 23:52" },
    { at: at(DAY, 7, 0), label: "Usual wake 07:00" },
    { at: at(DAY, 7, 28), label: "Mac unlocked 07:28" },
  ]);
});

test("sleep spans use asleep and woke labels", () => {
  const spans: PresenceSpan[] = [{ from: at("2026-11-16", 23, 50), to: at(DAY, 6, 30), kind: "suspend" }];
  assert.deepEqual(
    gapHints(overnight, spans, SETTINGS, DAY).map((h) => h.label),
    ["Mac asleep 23:50", "Mac woke 06:30", "Usual wake 07:00"],
  );
});

test("only the two longest spans of at least minGapMinutes are used", () => {
  const spans: PresenceSpan[] = [
    { from: at("2026-11-16", 23, 45), to: at("2026-11-16", 23, 50), kind: "lock" }, // 5 min, too short
    { from: at(DAY, 0, 10), to: at(DAY, 2, 0), kind: "lock" }, // 110 min
    { from: at(DAY, 2, 30), to: at(DAY, 2, 50), kind: "lock" }, // 20 min, third longest
    { from: at(DAY, 3, 0), to: at(DAY, 6, 0), kind: "suspend" }, // 180 min
  ];
  assert.deepEqual(
    gapHints(overnight, spans, SETTINGS, DAY).map((h) => h.label),
    ["Mac locked 00:10", "Mac unlocked 02:00", "Mac asleep 03:00", "Mac woke 06:00", "Usual wake 07:00"],
  );
});

test("hints within a minute of either gap edge are dropped", () => {
  const spans: PresenceSpan[] = [{ from: at("2026-11-16", 23, 40, 30), to: at(DAY, 8, 14, 30), kind: "lock" }];
  // 23:40 floors onto the gap start (dropped); 08:14 is exactly a minute inside the 08:15 end (kept).
  assert.deepEqual(
    gapHints(overnight, spans, SETTINGS, DAY).map((h) => h.label),
    ["Usual wake 07:00", "Mac unlocked 08:14"],
  );
});

test("in the same minute a presence hint beats usual wake, and an earlier span beats a later one", () => {
  const spans: PresenceSpan[] = [
    { from: at(DAY, 1, 0), to: at(DAY, 7, 0, 20), kind: "lock" },
    { from: at(DAY, 7, 0, 50), to: at(DAY, 7, 30), kind: "suspend" },
  ];
  assert.deepEqual(
    gapHints(overnight, spans, SETTINGS, DAY).map((h) => h.label),
    ["Mac locked 01:00", "Mac unlocked 07:00", "Mac woke 07:30"],
  );
});

test("a midday gap with no evidence and wake outside it has no hints", () => {
  const midday = gap(at(DAY, 12), at(DAY, 14));
  assert.deepEqual(gapHints(midday, [], SETTINGS, DAY), []);
  const outside: PresenceSpan[] = [{ from: at(DAY, 15), to: at(DAY, 16), kind: "lock" }];
  assert.deepEqual(gapHints(midday, outside, SETTINGS, DAY), []);
});
