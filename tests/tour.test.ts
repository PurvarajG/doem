import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickAdd } from "../lib/parse";
import { SHORTCUTS } from "../lib/shortcuts";
import { TOUR, TOUR_EDGE, TOUR_GAP, placeCard } from "../lib/tour";

const VIEW = { width: 1280, height: 800 };
const CARD = { width: 320, height: 200 };

test("no target: the card is centred", () => {
  assert.deepEqual(placeCard(null, CARD, VIEW), { top: 300, left: 480 });
});

test("the card goes on the asked side when it fits", () => {
  const target = { top: 100, left: 400, width: 200, height: 40 };
  assert.deepEqual(placeCard(target, CARD, VIEW, "bottom"), { top: 140 + TOUR_GAP, left: 400 });
  assert.deepEqual(placeCard(target, CARD, VIEW, "right"), { top: 100, left: 600 + TOUR_GAP });
});

test("no room on the asked side: the opposite side", () => {
  const target = { top: 50, left: 400, width: 200, height: 40 };
  assert.deepEqual(placeCard(target, CARD, VIEW, "top"), { top: 90 + TOUR_GAP, left: 400 });
});

test("a target as big as the window: the card sits inside its corner, on screen", () => {
  const target = { top: 0, left: 0, width: 1280, height: 800 };
  const pos = placeCard(target, CARD, VIEW, "bottom");
  assert.ok(pos.left + CARD.width <= VIEW.width - TOUR_EDGE);
  assert.ok(pos.top + CARD.height <= VIEW.height - TOUR_EDGE);
});

test("the card never leaves the window", () => {
  const target = { top: 300, left: 1200, width: 60, height: 30 };
  const pos = placeCard(target, CARD, VIEW, "bottom");
  assert.equal(pos.left, VIEW.width - CARD.width - TOUR_EDGE);
});

test("step ids are unique, and the tour opens and closes without an anchor", () => {
  assert.equal(new Set(TOUR.map((s) => s.id)).size, TOUR.length);
  assert.equal(TOUR[0].anchor, undefined);
  assert.equal(TOUR[TOUR.length - 1].anchor, undefined);
});

test("every Try it has a goal and an element you can use", () => {
  for (const step of TOUR.filter((s) => s.tryIt)) {
    assert.ok(step.goal, step.id);
    assert.ok(step.interactive && step.anchor, step.id);
  }
});

test("the quick-add example reads the way the step says", () => {
  const step = TOUR.find((s) => s.id === "capture")!;
  const typed = step.tryIt!.split("like: ")[1];
  const p = parseQuickAdd(typed, new Date("2026-11-16T09:00:00"));
  assert.equal(p.title, "Call dentist");
  assert.equal(p.priority, 1);
  assert.equal(p.minutes, 30);
  assert.equal(p.scheduled, undefined, "no day, so it stays in the Inbox");
});

test("single keys in the tour are real task shortcuts", () => {
  const taskKeys = new Set(SHORTCUTS.flatMap((s) => s.keys));
  for (const id of ["sort", "commit", "timer"]) {
    const step = TOUR.find((s) => s.id === id)!;
    for (const row of step.keys ?? []) for (const key of row.keys) assert.ok(taskKeys.has(key), `${id}: ${key}`);
  }
});
