import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createPresenceLog, MIN_SPAN_SECONDS, MERGE_GAP_SECONDS, RETENTION_DAYS } =
  require("../electron/presence-log.js");

type Span = { from: string; to: string; kind: "lock" | "suspend" };
type Data = { version: number; spans: Span[] } | null;

const T0 = new Date("2026-11-16T23:52:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function memoryLog(initial: unknown = null) {
  const store: { data: unknown; writes: number } = { data: initial, writes: 0 };
  const log = createPresenceLog({
    read: () => store.data,
    write: (data: Data) => {
      store.data = data;
      store.writes++;
    },
  });
  return { log, store };
}

test("constants", () => {
  assert.equal(MIN_SPAN_SECONDS, 60);
  assert.equal(MERGE_GAP_SECONDS, 120);
  assert.equal(RETENTION_DAYS, 14);
});

test("a lock then unlock stores one span with no timer involved", () => {
  const { log, store } = memoryLog();
  log.away(at(0), "lock");
  const span = log.back(at(7 * 3600));
  assert.deepEqual(span, { from: at(0).toISOString(), to: at(7 * 3600).toISOString(), kind: "lock" });
  assert.deepEqual(store.data, { version: 1, spans: [span] });
});

test("a span under 60 seconds is not stored", () => {
  const { log, store } = memoryLog();
  log.away(at(0), "lock");
  assert.equal(log.back(at(45)), null);
  assert.equal(store.writes, 0);
});

test("back without away does nothing", () => {
  const { log, store } = memoryLog();
  assert.equal(log.back(at(100)), null);
  assert.equal(store.writes, 0);
});

test("a second away keeps the first start", () => {
  const { log } = memoryLog();
  log.away(at(0), "lock");
  log.away(at(30), "suspend");
  assert.deepEqual(log.back(at(600)), { from: at(0).toISOString(), to: at(600).toISOString(), kind: "lock" });
});

test("two spans less than 120 seconds apart are stored as one, keeping the earlier kind", () => {
  const { log, store } = memoryLog();
  log.away(at(0), "suspend");
  log.back(at(3600));
  log.away(at(3690), "lock");
  const merged = log.back(at(7200));
  assert.deepEqual(merged, { from: at(0).toISOString(), to: at(7200).toISOString(), kind: "suspend" });
  assert.equal((store.data as { spans: Span[] }).spans.length, 1);
});

test("spans 120 seconds or more apart stay separate", () => {
  const { log, store } = memoryLog();
  log.away(at(0), "lock");
  log.back(at(600));
  log.away(at(720), "lock");
  log.back(at(1800));
  assert.equal((store.data as { spans: Span[] }).spans.length, 2);
});

test("spans that ended more than 14 days ago are dropped on the next write", () => {
  const old = { from: "2026-10-01T22:00:00.000Z", to: "2026-10-02T06:00:00.000Z", kind: "lock" };
  const recent = { from: "2026-11-10T22:00:00.000Z", to: "2026-11-11T06:00:00.000Z", kind: "lock" };
  const { log, store } = memoryLog({ version: 1, spans: [old, recent] });
  log.away(at(0), "lock");
  log.back(at(600));
  const spans = (store.data as { spans: Span[] }).spans;
  assert.equal(spans.length, 2);
  assert.equal(spans[0].from, recent.from);
});

test("a missing or malformed file reads as empty, and bad spans are skipped", () => {
  assert.deepEqual(memoryLog(null).log.spansBetween("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), []);
  assert.deepEqual(memoryLog("nonsense").log.spansBetween("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), []);
  const throwing = createPresenceLog({
    read: () => {
      throw new Error("bad json");
    },
    write: () => {},
  });
  assert.deepEqual(throwing.spansBetween("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), []);

  const good = { from: "2026-11-10T22:00:00.000Z", to: "2026-11-11T06:00:00.000Z", kind: "lock" };
  const { log } = memoryLog({
    version: 1,
    spans: [good, { from: "x", to: "y", kind: "lock" }, { from: good.from, to: good.to, kind: "nap" }, null],
  });
  assert.deepEqual(log.spansBetween("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), [good]);
});

test("spansBetween returns only overlapping spans in time order and rejects bad ranges", () => {
  const a = { from: "2026-11-15T22:00:00.000Z", to: "2026-11-16T06:00:00.000Z", kind: "lock" };
  const b = { from: "2026-11-16T12:00:00.000Z", to: "2026-11-16T13:00:00.000Z", kind: "suspend" };
  const c = { from: "2026-11-16T22:00:00.000Z", to: "2026-11-17T07:00:00.000Z", kind: "lock" };
  const { log } = memoryLog({ version: 1, spans: [c, a, b] });
  assert.deepEqual(log.spansBetween("2026-11-16T05:00:00.000Z", "2026-11-16T12:30:00.000Z"), [a, b]);
  assert.deepEqual(log.spansBetween("2026-11-16T06:00:00.000Z", "2026-11-16T12:00:00.000Z"), []);
  assert.deepEqual(log.spansBetween("not a date", "2026-11-16T12:00:00.000Z"), []);
});
