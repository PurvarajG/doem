import type { Activity, Category, Project, Segment, Task } from "@/lib/types";

type Labelled = Pick<Segment, "activityId" | "taskId" | "categoryId" | "note">;

/** A note as a title: trimmed, up to its first line break. Undefined when nothing is left. */
export function noteTitle(note: string | undefined): string | undefined {
  const first = (note ?? "").trim().split(/\r?\n/)[0].trim();
  return first || undefined;
}

export type SegmentSubject = {
  label: string;
  /** The note, when it is not already the label. */
  secondary?: string;
  /** Present only when the segment is task-linked and the task still exists. */
  task?: Task;
  /** The task's project, when it has one — lets a caller show a dot/name alongside the label. */
  project?: Project;
};

/**
 * What an entry is called: what you did, not the bucket it's in. An activity
 * or task names it (the note becomes a second line); otherwise the note does;
 * the category name is the last resort. A task or activity that no longer
 * exists falls through to the next rule.
 */
export function segmentSubject(
  segment: Labelled,
  categories: Category[],
  activities: Activity[],
  tasks: Task[],
  projects: Project[] = [],
): SegmentSubject {
  const note = noteTitle(segment.note);
  const activity = activities.find((a) => a.id === segment.activityId);
  if (activity) return { label: activity.name, secondary: note };
  const task = tasks.find((t) => t.id === segment.taskId);
  if (task) {
    const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
    return { label: task.title, secondary: note, task, project };
  }
  if (note) return { label: note };
  return { label: categories.find((c) => c.id === segment.categoryId)?.name ?? "Untitled" };
}

/** The title alone, for places with room for one line. */
export function segmentLabel(segment: Labelled, categories: Category[], activities: Activity[], tasks: Task[]): string {
  return segmentSubject(segment, categories, activities, tasks).label;
}
