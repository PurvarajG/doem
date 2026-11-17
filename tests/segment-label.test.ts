import assert from "node:assert/strict";
import test from "node:test";
import { segmentLabel, segmentSubject } from "../components/tracking/segment-label";
import type { Activity, Category, Project, Segment, Task } from "../lib/types";

const now = "2026-01-01T00:00:00.000Z";

const categories: Category[] = [
  { id: "cat-1", name: "Focus Work", color: "cat-indigo", kind: "work", sortOrder: 0, archived: false, createdAt: now },
];
const activities: Activity[] = [
  { id: "act-1", categoryId: "cat-1", name: "Deep work", isPreset: true, pinned: false, sortOrder: 0, archived: false, createdAt: now },
];
const projects: Project[] = [
  { id: "proj-1", name: "Atlas Launch", color: "#0052ff", archived: false, sortOrder: 0, createdAt: now },
];
const tasks: Task[] = [
  {
    id: "task-1",
    title: "Prep the client deck",
    projectId: "proj-1",
    boardOrder: 0,
    tags: [],
    scheduled: "2026-01-01",
    minutes: 30,
    priority: 0,
    status: "open",
    isComplex: false,
    sortOrder: 0,
    createdAt: now,
    subtasks: [],
  },
];

function segment(patch: Partial<Segment>): Pick<Segment, "activityId" | "taskId" | "categoryId" | "note"> {
  return { activityId: undefined, taskId: undefined, categoryId: "cat-1", note: undefined, ...patch };
}

test("segmentLabel prefers the activity, then the task, then falls back to the category", () => {
  assert.equal(segmentLabel(segment({ activityId: "act-1" }), categories, activities, tasks), "Deep work");
  assert.equal(segmentLabel(segment({ taskId: "task-1" }), categories, activities, tasks), "Prep the client deck");
  assert.equal(segmentLabel(segment({}), categories, activities, tasks), "Focus Work");
});

test("segmentSubject carries the task's project alongside the label", () => {
  const subject = segmentSubject(segment({ taskId: "task-1" }), categories, activities, tasks, projects);
  assert.equal(subject.label, "Prep the client deck");
  assert.equal(subject.task?.id, "task-1");
  assert.equal(subject.project?.name, "Atlas Launch");
});

test("segmentSubject has no project for an activity segment or a task with no project", () => {
  const activitySubject = segmentSubject(segment({ activityId: "act-1" }), categories, activities, tasks, projects);
  assert.equal(activitySubject.project, undefined);

  const orphanTask: Task = { ...tasks[0], id: "task-2", projectId: undefined };
  const subject = segmentSubject(segment({ taskId: "task-2" }), categories, activities, [orphanTask], projects);
  assert.equal(subject.task?.id, "task-2");
  assert.equal(subject.project, undefined);
});

test("an entry with only a category and a note is titled by the note", () => {
  const subject = segmentSubject(segment({ note: "Walked to the shop" }), categories, activities, tasks, projects);
  assert.equal(subject.label, "Walked to the shop");
  assert.equal(subject.secondary, undefined);
});

test("a task-linked entry keeps the task title and puts the note second", () => {
  const subject = segmentSubject(segment({ taskId: "task-1", note: "Slides 1 to 8" }), categories, activities, tasks, projects);
  assert.equal(subject.label, "Prep the client deck");
  assert.equal(subject.secondary, "Slides 1 to 8");
});

test("an activity entry keeps the activity name and puts the note second", () => {
  const subject = segmentSubject(segment({ activityId: "act-1", note: "Reading" }), categories, activities, tasks);
  assert.deepEqual([subject.label, subject.secondary], ["Deep work", "Reading"]);
});

test("a whitespace-only note counts as no note", () => {
  assert.equal(segmentLabel(segment({ note: "   \n  " }), categories, activities, tasks), "Focus Work");
  assert.equal(segmentSubject(segment({ taskId: "task-1", note: "  " }), categories, activities, tasks).secondary, undefined);
});

test("a note used as a title is trimmed and cut at its first line break", () => {
  assert.equal(segmentLabel(segment({ note: "  Called the bank \nthen the shop" }), categories, activities, tasks), "Called the bank");
  assert.equal(segmentLabel(segment({ note: "\n\nSecond line first" }), categories, activities, tasks), "Second line first");
});

test("a missing task or activity falls through to the note, and a missing category to Untitled", () => {
  assert.equal(segmentLabel(segment({ taskId: "gone", note: "Errands" }), categories, activities, tasks), "Errands");
  assert.equal(segmentLabel(segment({ activityId: "gone" }), categories, activities, tasks), "Focus Work");
  assert.equal(segmentLabel(segment({ categoryId: "gone" }), categories, activities, tasks), "Untitled");
});
