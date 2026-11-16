import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { BOARD_TEMPLATES, findTemplate, guessStageKind } from "../lib/board-templates";
import { freshDb, type TestDb } from "./helpers/db";

let db: TestDb;

before(async () => {
  db = await freshDb();
});
after(async () => db.close());

test("every template keeps the board rules: one done column, at least one open", () => {
  for (const t of BOARD_TEMPLATES) {
    assert.equal(t.stages.filter((s) => s.kind === "done").length, 1, t.id);
    assert.ok(t.stages.some((s) => s.kind !== "done"), t.id);
  }
});

test("a new column's behaviour is guessed from its name", () => {
  assert.equal(guessStageKind("To do"), "backlog");
  assert.equal(guessStageKind("Ideas"), "backlog");
  assert.equal(guessStageKind("Waiting on client"), "blocked");
  assert.equal(guessStageKind("Review"), "active");
});

test("applying a template moves every task and keeps done tasks done", async () => {
  const { project, stages } = await db.store.addProject({ name: "Board swap" });
  const [backlog, active, blocked] = stages;
  const task = (title: string, stageId?: string) =>
    db.store.addTask({ title, projectId: project.id, stageId, scheduled: "2026-03-01", minutes: 30, priority: 0 });
  const a = await task("In backlog", backlog.id);
  const b = await task("In progress", active.id);
  const c = await task("Blocked one", blocked.id);
  const d = await task("Finished");
  await db.store.completeTask(d.id);

  const created = await db.store.applyStageTemplate(project.id, findTemplate("simple")!.stages);
  assert.deepEqual(created.map((s) => s.name), ["To do", "Doing", "Done"]);
  assert.deepEqual((await db.store.listStages(project.id)).map((s) => s.name), ["To do", "Doing", "Done"]);

  const byId = new Map((await db.store.allTasks()).map((t) => [t.id, t]));
  const stageName = (id: string) => created.find((s) => s.id === byId.get(id)?.stageId)?.name;
  assert.equal(stageName(a.id), "To do");
  assert.equal(stageName(b.id), "Doing");
  // No blocked column in Simple, so it falls back to the first open column.
  assert.equal(stageName(c.id), "To do");
  assert.equal(stageName(d.id), "Done");
  assert.equal(byId.get(d.id)?.status, "done");
});

test("a saved template lists, applies to another board, and deletes", async () => {
  const saved = await db.store.saveBoardTemplate({
    name: "My flow",
    stages: [
      { name: "Someday", kind: "backlog" },
      { name: "This week", kind: "active" },
      { name: "Finished", kind: "done" },
    ],
  });
  assert.equal(saved.custom, true);
  assert.deepEqual((await db.store.listBoardTemplates()).map((t) => t.name), ["My flow"]);

  const { project } = await db.store.addProject({ name: "Uses my flow" });
  const fetched = await db.store.getBoardTemplate(saved.id);
  const created = await db.store.applyStageTemplate(project.id, fetched!.stages);
  assert.deepEqual(created.map((s) => s.name), ["Someday", "This week", "Finished"]);

  assert.equal(await db.store.deleteBoardTemplate(saved.id), true);
  assert.deepEqual(await db.store.listBoardTemplates(), []);
  // The board made from it keeps its columns.
  assert.equal((await db.store.listStages(project.id)).length, 3);
});

test("a template without exactly one done column can't be saved", async () => {
  await assert.rejects(
    db.store.saveBoardTemplate({
      name: "Broken",
      stages: [
        { name: "A", kind: "backlog" },
        { name: "B", kind: "active" },
      ],
    }),
    /exactly one done column/,
  );
});

test("switching templates never completes a task, even when an open column shares the done column's name", async () => {
  const { project, stages } = await db.store.addProject({ name: "Name clash" });
  // An open column called "Shipped"; the Software template's done column is also "Shipped".
  await db.store.updateStage(stages[1].id, { name: "Shipped" });
  const t = await db.store.addTask({
    title: "Still open",
    projectId: project.id,
    stageId: stages[1].id,
    scheduled: "2026-03-01",
    minutes: 30,
    priority: 0,
  });

  const created = await db.store.applyStageTemplate(project.id, findTemplate("software")!.stages);
  const after = (await db.store.allTasks()).find((x) => x.id === t.id)!;
  assert.equal(after.status, "open");
  assert.notEqual(created.find((s) => s.id === after.stageId)?.kind, "done");
});
