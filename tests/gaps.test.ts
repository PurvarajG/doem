import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { currentTrackingDayISO } from "../lib/tracking-day";
import type { Gap, TrackingSettings } from "../lib/types";
import { freshDb, type TestDb } from "./helpers/db";

let db: TestDb;
let categoryId: string;

const DEFAULT_SETTINGS: TrackingSettings = {
  dayStartHour: 4,
  wakingStartHour: 7,
  wakingEndHour: 23,
  minGapMinutes: 10,
  moduleOrder: [],
  hiddenModules: [],
  collapsedModules: [],
  hiddenNavItems: [],
  updatedAt: new Date().toISOString(),
};

before(async () => {
  db = await freshDb();
  categoryId = (await db.query<{ id: string }>(`select id from categories limit 1`))[0].id;
});
after(async () => db.close());

// The suite shares one database and a day's first gap looks back at the
// previous day, so every test uses dates at least two days from any other's.

/** A Date built from local Y/M/D + hour, matching how lib/store/segments.ts interprets a day boundary. */
function at(dayISO: string, hour: number, minute = 0): Date {
  const [y, m, d] = dayISO.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

async function segment(startedAt: Date, endedAt: Date | null) {
  const id = randomUUID();
  await db.query(
    `insert into segments (id, started_at, ended_at, category_id, source, running_lock)
     values ($1, $2, $3, $4, 'manual', $5)`,
    [id, startedAt.toISOString(), endedAt?.toISOString() ?? null, categoryId, endedAt ? null : true],
  );
  return id;
}

const span = (g: Gap) => [g.startedAt, g.endedAt];

test("a past day tracked from its start has no gaps, not even after its last entry", async () => {
  const day = "2026-02-02";
  await segment(at(day, 4), at(day, 23));
  assert.deepEqual(await db.store.findGaps(day, DEFAULT_SETTINGS), []);
});

test("a day with three holes yields three gaps", async () => {
  const day = "2026-02-05";
  await segment(at(day, 4), at(day, 9));
  await segment(at(day, 10), at(day, 13));
  await segment(at(day, 14), at(day, 18));
  await segment(at(day, 19), at(day, 23));

  const gaps = await db.store.findGaps(day, DEFAULT_SETTINGS);
  assert.deepEqual(
    gaps.map((g) => g.minutes),
    [60, 60, 60],
  );
});

test("sub-minGapMinutes holes are suppressed", async () => {
  const day = "2026-02-08";
  await segment(at(day, 4), at(day, 10));
  await segment(at(day, 10, 5), at(day, 13));
  await segment(at(day, 13, 20), at(day, 23));

  const gaps = await db.store.findGaps(day, DEFAULT_SETTINGS);
  assert.equal(gaps.length, 1, "only the 20-minute hole survives");
  assert.equal(gaps[0].minutes, 20);
});

test("a past day with no entries, after a day with none, is one gap from day start to day end", async () => {
  const day = "2026-02-11";
  const gaps = await db.store.findGaps(day, DEFAULT_SETTINGS);
  assert.deepEqual(gaps.map(span), [[at(day, 4).toISOString(), at("2026-02-12", 4).toISOString()]]);
});

test("an overnight hole is one gap on the morning's page and none on the evening's", async () => {
  const evening = "2026-02-14";
  const morning = "2026-02-15";
  await segment(at(evening, 7), at(evening, 23, 40));
  await segment(at(morning, 8, 15), at(morning, 12));

  const eveningGaps = await db.store.findGaps(evening, DEFAULT_SETTINGS);
  assert.deepEqual(
    eveningGaps.map(span),
    [[at(evening, 4).toISOString(), at(evening, 7).toISOString()]],
    "no gap starts at or after 23:40 on the evening's page",
  );

  const morningGaps = await db.store.findGaps(morning, DEFAULT_SETTINGS);
  assert.deepEqual(morningGaps.map(span)[0], [at(evening, 23, 40).toISOString(), at(morning, 8, 15).toISOString()]);
  assert.equal(morningGaps[0].minutes, 515);
  assert.equal(morningGaps.length, 1, "the past morning has no gap after its last entry");
});

test("with no entries the day before, the first gap starts at the day start", async () => {
  const day = "2026-02-18";
  await segment(at(day, 8, 15), at(day, 12));
  const gaps = await db.store.findGaps(day, DEFAULT_SETTINGS);
  assert.deepEqual(gaps.map(span), [[at(day, 4).toISOString(), at(day, 8, 15).toISOString()]]);
});

test("an empty past day after a tracked one is one gap ending at its day end, and the next day starts fresh", async () => {
  await segment(at("2026-02-21", 7), at("2026-02-21", 22));

  const empty = await db.store.findGaps("2026-02-22", DEFAULT_SETTINGS);
  assert.deepEqual(empty.map(span), [[at("2026-02-21", 22).toISOString(), at("2026-02-23", 4).toISOString()]]);

  const next = await db.store.findGaps("2026-02-23", DEFAULT_SETTINGS);
  assert.equal(next[0].startedAt, at("2026-02-23", 4).toISOString());
});

test("over three days no gaps overlap and gaps plus entries cover every minute", async () => {
  const days = ["2026-02-26", "2026-02-27", "2026-02-28"];
  const settings = { ...DEFAULT_SETTINGS, minGapMinutes: 1 };
  const entries: [Date, Date][] = [
    [at(days[0], 6), at(days[0], 9)],
    [at(days[0], 11), at(days[0], 23)],
    [at(days[1], 1), at(days[1], 2)], // after midnight, still day 0's tracking day
    [at(days[1], 9), at(days[1], 10)],
    [at(days[2], 3, 30), at(days[2], 5)], // crosses the 04:00 day start
    [at(days[2], 7), at(days[2], 21)],
  ];
  for (const [s, e] of entries) await segment(s, e);

  const gaps = (await Promise.all(days.map((d) => db.store.findGaps(d, settings)))).flat();
  const pieces = [
    ...gaps.map((g) => [new Date(g.startedAt).getTime(), new Date(g.endedAt).getTime()]),
    ...entries.map(([s, e]) => [s.getTime(), e.getTime()]),
  ].sort((a, b) => a[0] - b[0]);

  assert.equal(pieces[0][0], at(days[0], 4).getTime());
  for (let i = 1; i < pieces.length; i++) {
    assert.equal(pieces[i][0], pieces[i - 1][1], `piece ${i} starts where piece ${i - 1} ends`);
  }
  assert.equal(pieces[pieces.length - 1][1], at(days[2], 21).getTime());
});

test("today: the trailing gap runs to now, and a running timer suppresses it", async () => {
  const now = new Date();
  // Put the day start six hours back so today has room for fixtures whatever the clock says.
  const settings = { ...DEFAULT_SETTINGS, dayStartHour: (now.getHours() + 18) % 24 };
  const today = currentTrackingDayISO(now, settings.dayStartHour);
  const dayStart = at(today, settings.dayStartHour);
  const plus = (h: number) => new Date(dayStart.getTime() + h * 3600_000);
  await db.query(`delete from segments where started_at >= $1`, [new Date(dayStart.getTime() - 86_400_000).toISOString()]);

  await segment(plus(1), plus(2));
  let gaps = await db.store.findGaps(today, settings);
  assert.equal(gaps.length, 2);
  assert.deepEqual(span(gaps[0]), [dayStart.toISOString(), plus(1).toISOString()]);
  assert.equal(gaps[1].startedAt, plus(2).toISOString());
  assert.ok(Math.abs(new Date(gaps[1].endedAt).getTime() - Date.now()) < 5_000, "trailing gap ends now");

  const running = await segment(plus(3), null);
  gaps = await db.store.findGaps(today, settings);
  assert.deepEqual(gaps.map(span), [
    [dayStart.toISOString(), plus(1).toISOString()],
    [plus(2).toISOString(), plus(3).toISOString()],
  ]);
  await db.query(`delete from segments where id = $1`, [running]);
});

test("a future day has no gaps", async () => {
  const future = new Date(Date.now() + 3 * 86_400_000);
  const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  assert.deepEqual(await db.store.findGaps(iso, DEFAULT_SETTINGS), []);
});
