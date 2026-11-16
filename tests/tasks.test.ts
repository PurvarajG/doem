import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { addDays, toISODate } from "../lib/parse";
import { CommitCapReached, TaskInvariantError } from "../lib/store/tasks";
import { freshDb, type TestDb } from "./helpers/db";

let db: TestDb;

before(async () => {
  db = await freshDb();
});
after(async () => db.close());

function task(overrides: Record<string, unknown> = {}) {
  return db.store.addTask({
    title: "A task",
    scheduled: "2026-03-01",
    minutes: 30,
    priority: 0,
    ...overrides,
  });
}

test("a new project task lands in the first open column", async () => {
  const { project, stages } = await db.store.addProject({ name: "Intake" });
  const t = await task({ projectId: project.id });
  assert.equal(t.stageId, stages[0].id);
});

test("changing project moves the task to the new project's first column", async () => {
  const a = await db.store.addProject({ name: "From" });
  const b = await db.store.addProject({ name: "To" });
  const t = await task({ projectId: a.project.id, stageId: a.stages[1].id });

  const moved = await db.store.updateTask(t.id, { projectId: b.project.id });
  assert.equal(moved?.projectId, b.project.id);
  assert.equal(moved?.stageId, b.stages[0].id);
});

test("clearing the project clears the column", async () => {
  const { project } = await db.store.addProject({ name: "Detach" });
  const t = await task({ projectId: project.id });

  const loose = await db.store.updateTask(t.id, { projectId: "" });
  assert.equal(loose?.projectId, undefined);
  assert.equal(loose?.stageId, undefined);
});

test("a column from another project is refused", async () => {
  const a = await db.store.addProject({ name: "Own" });
  const b = await db.store.addProject({ name: "Other" });
  const t = await task({ projectId: a.project.id });

  await assert.rejects(
    () => db.store.updateTask(t.id, { stageId: b.stages[0].id }),
    TaskInvariantError,
  );
});

test("completing a project task moves it to Done, and reopening brings it back", async () => {
  const { project, stages } = await db.store.addProject({ name: "Lifecycle" });
  const t = await task({ projectId: project.id, stageId: stages[1].id });

  const completed = await db.store.completeTask(t.id);
  assert.equal(completed?.task.status, "done");
  assert.equal(completed?.task.stageId, stages[3].id);

  const reopened = await db.store.reopenTask(t.id);
  assert.equal(reopened?.status, "open");
  assert.equal(reopened?.stageId, stages[0].id, "reopening returns to the first open column");
});

test("completing a recurring task creates the next occurrence in the open column", async () => {
  const { project, stages } = await db.store.addProject({ name: "Recurring" });
  const start = addDays(toISODate(new Date()), 1);
  const t = await task({
    projectId: project.id,
    scheduled: start,
    recurrence: { freq: "weekly", interval: 1 },
  });

  const result = await db.store.completeTask(t.id);
  assert.equal(result?.next?.scheduled, addDays(start, 7));
  assert.equal(result?.next?.status, "open");
  assert.equal(result?.next?.stageId, stages[0].id);
});

test("a recurring task scheduled weeks ago rolls forward past today on the same cadence", async () => {
  const today = toISODate(new Date());
  const start = addDays(today, -45);
  const t = await task({
    scheduled: start,
    recurrence: { freq: "weekly", interval: 1 },
  });

  const result = await db.store.completeTask(t.id);
  const next = result?.next?.scheduled;
  assert.ok(next && next > today, `next ${next} should be after ${today}`);
  const gapDays = (Date.parse(next + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000;
  assert.equal(gapDays % 7, 0, "stays on the original weekday cadence");
});

test("a recurring task with from: done schedules the next one a week from today", async () => {
  const today = toISODate(new Date());
  const t = await task({
    scheduled: addDays(today, -45),
    recurrence: { freq: "weekly", interval: 1, from: "done" },
  });

  const result = await db.store.completeTask(t.id);
  assert.equal(result?.next?.scheduled, addDays(today, 7));
});

test("a task with no project completes without needing a column", async () => {
  const t = await task();
  const result = await db.store.completeTask(t.id);
  assert.equal(result?.task.status, "done");
  assert.equal(result?.task.stageId, undefined);
});

test("a complex task requires a finish date on or after scheduled", async () => {
  await assert.rejects(
    () => task({ isComplex: true }),
    TaskInvariantError,
    "no finishDate at all",
  );
  await assert.rejects(
    () => task({ isComplex: true, finishDate: "2026-02-28" }),
    TaskInvariantError,
    "finishDate before scheduled",
  );

  const t = await task({ isComplex: true, finishDate: "2026-03-01", scheduled: "2026-03-01" });
  assert.equal(t.finishDate, "2026-03-01", "equal to scheduled is allowed");
});

test("a complex task clears dueTime, since a time-of-day doesn't apply to a range", async () => {
  const t = await task({
    isComplex: true,
    finishDate: "2026-03-05",
    dueTime: "09:00",
  });
  assert.equal(t.dueTime, undefined);
});

test("turning complex off clears the finish date", async () => {
  const t = await task({ isComplex: true, finishDate: "2026-03-05" });
  const toggledOff = await db.store.updateTask(t.id, { isComplex: false });
  assert.equal(toggledOff?.isComplex, false);
  assert.equal(toggledOff?.finishDate, undefined);
});

test("patching only the finish date on an existing complex task is validated against scheduled", async () => {
  const t = await task({ isComplex: true, finishDate: "2026-03-05" });
  await assert.rejects(
    () => db.store.updateTask(t.id, { finishDate: "2026-02-15" }),
    TaskInvariantError,
  );

  const extended = await db.store.updateTask(t.id, { finishDate: "2026-03-10" });
  assert.equal(extended?.finishDate, "2026-03-10");
});

test("moving scheduled past an existing finish date is refused", async () => {
  const t = await task({ isComplex: true, finishDate: "2026-03-05" });
  await assert.rejects(
    () => db.store.updateTask(t.id, { scheduled: "2026-03-10" }),
    TaskInvariantError,
  );
});

test("deleting a project leaves its tasks intact but unassigned", async () => {
  const { project } = await db.store.addProject({ name: "Doomed" });
  const t = await task({ projectId: project.id });

  await db.store.deleteProject(project.id);

  const survivor = await db.store.getTask(t.id);
  assert.equal(survivor?.projectId, undefined);
  assert.equal(survivor?.stageId, undefined);
});

// ── Status, lane and recurrence stay in agreement ────────────────────────────

const WEEKLY = { freq: "weekly", interval: 1 } as const;

async function successors(title: string, exceptId: string) {
  return (await db.store.allTasks()).filter(
    (t) => t.title === title && t.id !== exceptId && t.status === "open",
  );
}

async function lane(stageId: string) {
  return (await db.store.allTasks())
    .filter((t) => t.stageId === stageId)
    .sort((a, b) => a.boardOrder - b.boardOrder);
}

test("dragging a recurring task into Done creates exactly one next occurrence", async () => {
  const { project, stages } = await db.store.addProject({ name: "Drag recur" });
  const t = await task({ title: "Drag weekly", projectId: project.id, recurrence: WEEKLY });

  const done = await db.store.moveTaskToStage(t.id, stages[3].id, 0);
  assert.equal(done?.status, "done");
  assert.equal(done?.stageId, stages[3].id);
  const next = await successors("Drag weekly", t.id);
  assert.equal(next.length, 1);
  assert.equal(next[0].stageId, stages[0].id, "the next occurrence lands in the first open lane");

  // Reordering inside Done is not a second completion.
  await db.store.moveTaskToStage(t.id, stages[3].id, 0);
  assert.equal((await successors("Drag weekly", t.id)).length, 1);
});

test("a patch that lands in Done creates exactly one next occurrence", async () => {
  const { project, stages } = await db.store.addProject({ name: "Patch recur" });
  const t = await task({ title: "Patch weekly", projectId: project.id, recurrence: WEEKLY });

  const done = await db.store.updateTask(t.id, { stageId: stages[3].id });
  assert.equal(done?.status, "done");
  assert.ok(done?.completedAt);
  assert.equal((await successors("Patch weekly", t.id)).length, 1);

  await db.store.updateTask(t.id, { title: "Patch weekly", stageId: stages[3].id });
  assert.equal((await successors("Patch weekly", t.id)).length, 1);
});

test("completing a done task again spawns nothing and changes nothing", async () => {
  const { project } = await db.store.addProject({ name: "Twice" });
  const t = await task({ title: "Twice weekly", projectId: project.id, recurrence: WEEKLY });

  const first = await db.store.completeTask(t.id);
  assert.ok(first?.next);
  const again = await db.store.completeTask(t.id);
  assert.equal(again?.next, null);
  assert.equal(again?.task.completedAt, first?.task.completedAt);
  assert.equal((await successors("Twice weekly", t.id)).length, 1);
});

test("a trashed task cannot be completed", async () => {
  const t = await task({ title: "Gone" });
  await db.store.trashTask(t.id);
  assert.equal(await db.store.completeTask(t.id), null);
  assert.equal((await db.store.getTask(t.id))?.status, "trashed");
});

test("reopening deletes the unstarted next occurrence", async () => {
  const { project, stages } = await db.store.addProject({ name: "Reopen recur" });
  const t = await task({ title: "Reopen weekly", projectId: project.id, recurrence: WEEKLY });
  const done = await db.store.completeTask(t.id);
  assert.ok(done?.next);

  await db.store.reopenTask(t.id);
  assert.equal(await db.store.getTask(done.next.id), null);
  assert.equal((await db.store.getTask(t.id))?.status, "open");

  // Dragging a done task out of Done does the same.
  const again = await db.store.completeTask(t.id);
  assert.ok(again?.next);
  await db.store.moveTaskToStage(t.id, stages[1].id, 0);
  assert.equal(await db.store.getTask(again.next.id), null);

  // So does a patch that takes it out of the done lane.
  const third = await db.store.completeTask(t.id);
  assert.ok(third?.next);
  await db.store.updateTask(t.id, { stageId: stages[0].id });
  assert.equal(await db.store.getTask(third.next.id), null);
  assert.equal((await db.store.getTask(t.id))?.status, "open");
});

test("reopening keeps a next occurrence that has tracked time, and does not spawn another", async () => {
  const { project } = await db.store.addProject({ name: "Started recur" });
  const t = await task({ title: "Started weekly", projectId: project.id, recurrence: WEEKLY });
  const done = await db.store.completeTask(t.id);
  assert.ok(done?.next);
  await db.store.addManualEntry({
    taskId: done.next.id,
    startedAt: "2026-03-01T09:00:00.000Z",
    minutes: 15,
  });

  await db.store.reopenTask(t.id);
  assert.ok(await db.store.getTask(done.next.id), "the started occurrence survives");

  const again = await db.store.completeTask(t.id);
  assert.equal(again?.next, null, "an open occurrence already links back to this task");
});

test("a done task that is trashed and restored comes back done in the Done lane", async () => {
  const { project, stages } = await db.store.addProject({ name: "Restore done" });
  const t = await task({ projectId: project.id });
  await db.store.completeTask(t.id);
  await db.store.trashTask(t.id);

  const restored = await db.store.restoreTask(t.id);
  assert.equal(restored?.status, "done");
  assert.ok(restored?.completedAt);
  assert.equal(restored?.deletedAt, undefined);
  assert.equal(restored?.stageId, stages[3].id);
});

test("an open task that is trashed and restored comes back open and spawns nothing", async () => {
  const { project, stages } = await db.store.addProject({ name: "Restore open" });
  const t = await task({
    title: "Restore weekly",
    projectId: project.id,
    stageId: stages[1].id,
    recurrence: WEEKLY,
  });
  await db.store.trashTask(t.id);

  const restored = await db.store.restoreTask(t.id);
  assert.equal(restored?.status, "open");
  assert.equal(restored?.stageId, stages[1].id);
  assert.equal((await successors("Restore weekly", t.id)).length, 0);
});

test("restoring an open task whose lane became Done moves it to the first open lane", async () => {
  const { project, stages } = await db.store.addProject({ name: "Restore edge" });
  const t = await task({ projectId: project.id, stageId: stages[1].id });
  await db.store.trashTask(t.id);
  // The lane is removed into Done while the task sits in the trash.
  await db.store.removeStage(stages[1].id, stages[3].id);
  assert.equal((await db.store.getTask(t.id))?.stageId, stages[3].id);
  assert.equal((await db.store.getTask(t.id))?.status, "trashed");

  const restored = await db.store.restoreTask(t.id);
  assert.equal(restored?.status, "open");
  assert.equal(restored?.completedAt, undefined);
  assert.equal(restored?.stageId, stages[0].id);
  assert.ok(restored?.stageEnteredAt);
});

test("restore appends to the lane without a duplicate board_order", async () => {
  const { project, stages } = await db.store.addProject({ name: "Restore order" });
  const a = await task({ title: "A", projectId: project.id, stageId: stages[0].id });
  const b = await task({ title: "B", projectId: project.id, stageId: stages[0].id });
  const c = await task({ title: "C", projectId: project.id, stageId: stages[0].id });
  await db.store.trashTask(b.id);

  assert.deepEqual(
    (await lane(stages[0].id)).filter((x) => x.status !== "trashed").map((x) => [x.title, x.boardOrder]),
    [
      ["A", 0],
      ["C", 1],
    ],
  );

  await db.store.restoreTask(b.id);
  const after = await lane(stages[0].id);
  assert.deepEqual(after.map((x) => x.title), ["A", "C", "B"]);
  assert.deepEqual(after.map((x) => x.boardOrder), [0, 1, 2]);
  assert.ok(a.id && c.id);
});

test("a drop lands at the visible position after a task was trashed", async () => {
  const { project, stages } = await db.store.addProject({ name: "Drop after trash" });
  const a = await task({ title: "A", projectId: project.id, stageId: stages[0].id });
  const b = await task({ title: "B", projectId: project.id, stageId: stages[0].id });
  const c = await task({ title: "C", projectId: project.id, stageId: stages[0].id });
  const mover = await task({ title: "Mover", projectId: project.id, stageId: stages[1].id });
  await db.store.trashTask(a.id);

  // The visible lane is B, C, so index 1 means between them.
  await db.store.moveTaskToStage(mover.id, stages[0].id, 1);
  const visible = (await lane(stages[0].id)).filter((x) => x.status !== "trashed");
  assert.deepEqual(visible.map((x) => x.title), ["B", "Mover", "C"]);
  assert.deepEqual(visible.map((x) => x.boardOrder), [0, 1, 2]);
  assert.ok(b.id && c.id);
});

test("a drop lands at the visible position after a task was completed out of the lane", async () => {
  const { project, stages } = await db.store.addProject({ name: "Drop after complete" });
  const a = await task({ title: "A", projectId: project.id, stageId: stages[0].id });
  const b = await task({ title: "B", projectId: project.id, stageId: stages[0].id });
  const c = await task({ title: "C", projectId: project.id, stageId: stages[0].id });
  const mover = await task({ title: "Mover", projectId: project.id, stageId: stages[1].id });
  await db.store.completeTask(a.id);

  assert.deepEqual((await lane(stages[0].id)).map((x) => x.boardOrder), [0, 1]);
  await db.store.moveTaskToStage(mover.id, stages[0].id, 1);
  assert.deepEqual((await lane(stages[0].id)).map((x) => x.title), ["B", "Mover", "C"]);
  assert.ok(b.id && c.id);
});

test("a drop into Done honours the index and ignores trashed tasks there", async () => {
  const { project, stages } = await db.store.addProject({ name: "Drop into done" });
  const a = await task({ title: "A", projectId: project.id });
  const b = await task({ title: "B", projectId: project.id });
  const c = await task({ title: "C", projectId: project.id });
  await db.store.completeTask(a.id);
  await db.store.completeTask(b.id);
  await db.store.trashTask(a.id);

  await db.store.moveTaskToStage(c.id, stages[3].id, 0);
  const visible = (await lane(stages[3].id)).filter((x) => x.status !== "trashed");
  assert.deepEqual(visible.map((x) => x.title), ["C", "B"]);
  assert.deepEqual(visible.map((x) => x.boardOrder), [0, 1]);
});

async function seedLane(titles: string[], name: string, trashedAt?: number) {
  const { project, stages } = await db.store.addProject({ name });
  const made = [];
  for (const title of titles) {
    made.push(await task({ title, projectId: project.id, stageId: stages[0].id }));
  }
  if (trashedAt !== undefined) await db.store.trashTask(made[trashedAt].id);
  const visible = async () =>
    (await lane(stages[0].id)).filter((x) => x.status !== "trashed");
  return { stages, made, visible };
}

test("a same-lane drop down by one place lands where the board shows it", async () => {
  const { stages, made, visible } = await seedLane(["X", "A", "B", "C"], "Same lane down one");
  // Dropping X on the lower half of B sends index 3 (X still counted).
  await db.store.moveTaskToStage(made[0].id, stages[0].id, 3);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "B", "X", "C"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("a same-lane drop down by several places lands where the board shows it", async () => {
  const { stages, made, visible } = await seedLane(["X", "A", "B", "C"], "Same lane down more");
  await db.store.moveTaskToStage(made[0].id, stages[0].id, 2);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "X", "B", "C"]);
  await db.store.moveTaskToStage(made[0].id, stages[0].id, 4);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "B", "C", "X"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("a same-lane drop down with a trashed card in the lane uses visible positions", async () => {
  // Lane is X, T (trashed), A, B, C; the board shows X, A, B, C.
  const { stages, made, visible } = await seedLane(["X", "T", "A", "B", "C"], "Same lane trashed", 1);
  await db.store.moveTaskToStage(made[0].id, stages[0].id, 3);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "B", "X", "C"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("a same-lane drop down with a trashed card above the dragged one uses visible positions", async () => {
  const { stages, made, visible } = await seedLane(["T", "X", "A", "B", "C"], "Same lane trashed above", 0);
  await db.store.moveTaskToStage(made[1].id, stages[0].id, 2);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "X", "B", "C"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("a same-lane drop up still lands at the index", async () => {
  const { stages, made, visible } = await seedLane(["A", "B", "C", "X"], "Same lane up");
  await db.store.moveTaskToStage(made[3].id, stages[0].id, 1);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "X", "B", "C"]);
  await db.store.moveTaskToStage(made[3].id, stages[0].id, 0);
  assert.deepEqual((await visible()).map((x) => x.title), ["X", "A", "B", "C"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("dropping a card at its own position leaves the order unchanged", async () => {
  const { stages, made, visible } = await seedLane(["A", "X", "B", "C"], "Same lane own spot");
  // The card sits at 1; the board sends 1 (upper half) or 2 (lower half).
  await db.store.moveTaskToStage(made[1].id, stages[0].id, 1);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "X", "B", "C"]);
  await db.store.moveTaskToStage(made[1].id, stages[0].id, 2);
  assert.deepEqual((await visible()).map((x) => x.title), ["A", "X", "B", "C"]);
  assert.deepEqual((await visible()).map((x) => x.boardOrder), [0, 1, 2, 3]);
});

test("reordering downward inside the Done lane lands where the board shows it", async () => {
  const { project, stages } = await db.store.addProject({ name: "Done reorder down" });
  const made = [];
  for (const title of ["X", "A", "B", "C"]) made.push(await task({ title, projectId: project.id }));
  for (const t of made) await db.store.completeTask(t.id);
  assert.deepEqual((await lane(stages[3].id)).map((x) => x.title), ["X", "A", "B", "C"]);

  await db.store.moveTaskToStage(made[0].id, stages[3].id, 3);
  const done = await lane(stages[3].id);
  assert.deepEqual(done.map((x) => x.title), ["A", "B", "X", "C"]);
  assert.deepEqual(done.map((x) => x.boardOrder), [0, 1, 2, 3]);
  assert.ok(done.every((x) => x.status === "done"));
});
