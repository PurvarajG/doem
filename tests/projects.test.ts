import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PROJECT_COLORS } from "../lib/types";
import { freshDb, type TestDb } from "./helpers/db";

let db: TestDb;

before(async () => {
  db = await freshDb();
});
after(async () => db.close());

test("auto-created projects cycle through the palette", async () => {
  const made = [];
  for (let i = 0; i < PROJECT_COLORS.length + 1; i++) {
    made.push((await db.store.addProject({ name: `Project ${i}` })).project);
  }
  assert.deepEqual(
    made.slice(0, PROJECT_COLORS.length).map((p) => p.color),
    [...PROJECT_COLORS],
  );
  // Wraps around rather than running out.
  assert.equal(made[PROJECT_COLORS.length].color, PROJECT_COLORS[0]);
});

test("an explicit colour still wins", async () => {
  const { project } = await db.store.addProject({ name: "Custom", color: "#123456" });
  assert.equal(project.color, "#123456");
});

test("findOrCreateProjectByName returns the active project, matching case-insensitively", async () => {
  const { project } = await db.store.addProject({ name: "Garden" });
  const found = await db.store.findOrCreateProjectByName("gARDEN");
  assert.equal(found.id, project.id);
});

test("findOrCreateProjectByName ignores an archived project and creates a new one", async () => {
  const { project: old } = await db.store.addProject({ name: "Health" });
  await db.store.updateProject(old.id, { archived: true });

  const made = await db.store.findOrCreateProjectByName("health");
  assert.notEqual(made.id, old.id);
  assert.equal(made.name, "health");
  assert.equal(made.archived, false);

  // The archived one is untouched, and the new one is now the match.
  assert.equal((await db.store.getProject(old.id))?.archived, true);
  assert.equal((await db.store.findOrCreateProjectByName("Health")).id, made.id);
});
