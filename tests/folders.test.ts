import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { freshDb, type TestDb } from "./helpers/db";

let db: TestDb;

before(async () => {
  db = await freshDb();
});
after(async () => db.close());

test("folders are created in order and can be renamed", async () => {
  const work = await db.store.addFolder({ name: "Work" });
  const home = await db.store.addFolder({ name: "Home" });
  assert.ok(home.sortOrder > work.sortOrder);
  const renamed = await db.store.renameFolder(home.id, "Personal");
  assert.equal(renamed?.name, "Personal");
  const names = (await db.store.listFolders()).map((f) => f.name);
  assert.deepEqual(names.slice(-2), ["Work", "Personal"]);
});

test("a project can be filed, moved out, and survives its folder being deleted", async () => {
  const folder = await db.store.addFolder({ name: "Clients" });
  const { project } = await db.store.addProject({ name: "Acme", folderId: folder.id });
  assert.equal(project.folderId, folder.id);

  const unfiled = await db.store.updateProject(project.id, { folderId: "" });
  assert.equal(unfiled?.folderId, undefined);

  await db.store.updateProject(project.id, { folderId: folder.id });
  assert.equal(await db.store.deleteFolder(folder.id), true);
  const after = await db.store.getProject(project.id);
  assert.ok(after, "project still exists");
  assert.equal(after.folderId, undefined);
});
