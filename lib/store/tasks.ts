import { randomUUID } from "node:crypto";
import { withTransaction } from "../db";
import type { Tx } from "../db";
import { addDays, daysBetween, nextOccurrence, toISODate } from "../parse";
import type { Subtask, Task, TaskInput } from "../types";
import {
  db,
  hydrate,
  rowToSubtask,
  type Q,
  type SubtaskRow,
  type TaskRow,
} from "./rows";
import {
  doneStageOf,
  firstOpenStageOf,
  getStage,
  placeInStage,
  renumberStage,
} from "./stages";

/** Thrown when a patch would put a task in another project's column; APIs map it to 400. */
export class TaskInvariantError extends Error {}

export async function allTasks(): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `select * from tasks where status <> 'trashed' order by sort_order asc, created_at asc`,
  );
  return hydrate(db, rows);
}

export async function trashedTasks(): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `select * from tasks where status = 'trashed' order by deleted_at desc`,
  );
  return hydrate(db, rows);
}

export async function getTask(id: string, q: Q = db): Promise<Task | null> {
  const rows = await q.query<TaskRow>(`select * from tasks where id = $1`, [id]);
  if (rows.length === 0) return null;
  return (await hydrate(q, rows))[0];
}

export async function search(q: string): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `select * from tasks
      where status <> 'trashed' and (title ilike $1 or notes ilike $1 or $2 = any(tags))
      order by scheduled asc nulls last`,
    [`%${q}%`, q.toLowerCase()],
  );
  return hydrate(db, rows);
}

/** Resolves the column a task should sit in, rejecting cross-project columns. */
async function resolveStage(
  tx: Tx,
  projectId: string | undefined,
  stageId: string | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  if (stageId) {
    const stage = await getStage(stageId, tx);
    if (!stage || stage.projectId !== projectId) {
      throw new TaskInvariantError("That column belongs to a different project");
    }
    return stage.id;
  }
  return (await firstOpenStageOf(tx, projectId))?.id ?? null;
}

/**
 * A complex task's finish date must be on or after its scheduled start; a
 * non-complex task never carries a finish date. `dueTime` doesn't apply to a
 * multi-day span, so it's cleared whenever the task is complex.
 */
function resolveComplex(
  isComplex: boolean,
  scheduled: string | null,
  finishDate: string | undefined,
  dueTime: string | undefined,
): { finishDate: string | undefined; dueTime: string | undefined } {
  if (!isComplex) return { finishDate: undefined, dueTime };
  if (!scheduled) {
    throw new TaskInvariantError("A complex task needs a scheduled date");
  }
  if (!finishDate || finishDate < scheduled) {
    throw new TaskInvariantError("finishDate must be on or after scheduled for a complex task");
  }
  return { finishDate, dueTime: undefined };
}

function checkWindow(startOn: string | null | undefined, expiresOn: string | null | undefined) {
  if (startOn && expiresOn && expiresOn < startOn) {
    throw new TaskInvariantError("expiresOn must be on or after startOn");
  }
}

async function insertTask(tx: Tx, input: TaskInput, recursFrom?: string): Promise<Task> {
  const stageId = await resolveStage(tx, input.projectId, input.stageId);
  const isComplex = input.isComplex ?? false;
  const scheduled = input.scheduled ?? null;
  const resolved = resolveComplex(isComplex, scheduled, input.finishDate, input.dueTime);
  checkWindow(input.startOn, input.expiresOn);
  const rows = await tx.query<TaskRow>(
    `insert into tasks
       (id, title, notes, project_id, stage_id, tags, scheduled, due_time, minutes,
        priority, status, recurrence, sort_order, board_order, is_complex, finish_date,
        committed_on, start_on, expires_on, stage_entered_at, recurs_from)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,
       coalesce((select max(sort_order) + 1 from tasks), 0),
       coalesce((select max(board_order) + 1 from tasks
                   where stage_id = $5 and status <> 'trashed'), 0),
       $12, $13, $14, $15, $16,
       case when $5::uuid is null then null else now() end, $17)
     returning *`,
    [
      randomUUID(),
      input.title,
      input.notes ?? null,
      input.projectId ?? null,
      stageId,
      input.tags ?? [],
      scheduled,
      resolved.dueTime ?? null,
      input.minutes,
      input.priority,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
      isComplex,
      resolved.finishDate ?? null,
      input.committedOn ?? null,
      input.startOn ?? null,
      input.expiresOn ?? null,
      recursFrom ?? null,
    ],
  );
  return (await hydrate(tx, rows))[0];
}

export async function addTask(input: TaskInput): Promise<Task> {
  return withTransaction((tx) => insertTask(tx, input));
}

/** All-or-nothing batch create; tasks come back in input order. */
export async function addTasks(inputs: TaskInput[]): Promise<Task[]> {
  if (inputs.length === 0) return [];
  return withTransaction(async (tx) => {
    const out: Task[] = [];
    for (const input of inputs) out.push(await insertTask(tx, input));
    return out;
  });
}

/**
 * Moves every task to `day` (null = back to the inbox) in one transaction.
 * Complex tasks keep their span length; a committed task that no longer sits
 * on its committed day is uncommitted. Unknown ids are skipped.
 */
export async function rescheduleTasks(ids: string[], day: string | null): Promise<Task[]> {
  if (ids.length === 0) return [];
  return withTransaction(async (tx) => {
    const out: Task[] = [];
    for (const id of ids) {
      const current = await getTask(id, tx);
      if (!current) continue;
      let finish: string | null = current.finishDate ?? null;
      if (current.isComplex) {
        if (day === null) {
          throw new TaskInvariantError("A complex task needs a scheduled date");
        }
        if (current.scheduled && finish) {
          finish = addDays(finish, daysBetween(current.scheduled, day));
        }
      }
      const rows = await tx.query<TaskRow>(
        `update tasks
            set scheduled = $2, finish_date = $3,
                committed_on = case when committed_on = $2::date then committed_on else null end
          where id = $1
          returning *`,
        [id, day, current.isComplex ? finish : (current.finishDate ?? null)],
      );
      if (rows.length) out.push((await hydrate(tx, rows))[0]);
    }
    return out;
  });
}

/** The day is full; the caller offers "Swap with..." using `committed`. */
export class CommitCapReached extends Error {
  committed: Task[];
  constructor(message: string, committed: Task[]) {
    super(message);
    this.name = "CommitCapReached";
    this.committed = committed;
  }
}

export async function commitTask(id: string, day: string): Promise<Task | null> {
  return withTransaction(async (tx) => {
    const task = await getTask(id, tx);
    if (!task) return null;
    if (task.committedOn === day && task.status === "open") return task;

    const capRows = await tx.query<{ today_cap: number | null }>(
      `select today_cap from tracking_settings limit 1`,
    );
    const cap = capRows[0]?.today_cap ?? 3;
    const others = await tx.query<TaskRow>(
      `select * from tasks
        where status = 'open' and committed_on = $1 and id <> $2
        order by sort_order asc, created_at asc`,
      [day, id],
    );
    if (others.length >= cap) {
      throw new CommitCapReached(
        `Already ${others.length} committed for ${day}`,
        await hydrate(tx, others),
      );
    }
    const rows = await tx.query<TaskRow>(
      `update tasks set committed_on = $2 where id = $1 returning *`,
      [id, day],
    );
    return (await hydrate(tx, rows))[0];
  });
}

export async function uncommitTask(id: string): Promise<Task | null> {
  const rows = await db.query<TaskRow>(
    `update tasks set committed_on = null where id = $1 returning *`,
    [id],
  );
  if (rows.length === 0) return null;
  return (await hydrate(db, rows))[0];
}

/** Trashes open tasks whose expiry day has arrived; returns them for the review's undo list. */
export async function expireDueTasks(todayISO: string): Promise<Task[]> {
  return withTransaction(async (tx) => {
    const rows = await tx.query<TaskRow>(
      `update tasks set status = 'trashed', deleted_at = now()
        where status = 'open' and expires_on is not null and expires_on <= $1
        returning *`,
      [todayISO],
    );
    return hydrate(tx, rows);
  });
}

/**
 * One patch path for every surface. Project, stage, and status are kept
 * consistent here so no caller can produce a task that is "done" outside the
 * done column, or sitting in a column of a project it no longer belongs to.
 */
export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task | null> {
  return withTransaction(async (tx) => {
    const current = await getTask(id, tx);
    if (!current) return null;

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    const col = (name: string, value: unknown) => {
      sets.push(`${name} = $${i++}`);
      vals.push(value);
    };

    if (patch.title !== undefined) col("title", patch.title);
    if (patch.notes !== undefined) col("notes", patch.notes || null);
    if (patch.tags !== undefined) col("tags", patch.tags);
    if (patch.scheduled !== undefined) col("scheduled", patch.scheduled);
    if (patch.committedOn !== undefined) col("committed_on", patch.committedOn);
    if (patch.startOn !== undefined) col("start_on", patch.startOn);
    if (patch.expiresOn !== undefined) col("expires_on", patch.expiresOn);
    if (patch.startOn !== undefined || patch.expiresOn !== undefined) {
      checkWindow(
        patch.startOn !== undefined ? patch.startOn : current.startOn,
        patch.expiresOn !== undefined ? patch.expiresOn : current.expiresOn,
      );
    }
    if (patch.minutes !== undefined) col("minutes", patch.minutes);
    if (patch.priority !== undefined) col("priority", patch.priority);
    if (patch.recurrence !== undefined)
      col("recurrence", patch.recurrence ? JSON.stringify(patch.recurrence) : null);

    // The complex-task range and the due-time it displaces are kept
    // consistent as one unit, same pattern as the project/stage block below.
    if (patch.isComplex !== undefined || patch.finishDate !== undefined || patch.dueTime !== undefined) {
      const isComplex = patch.isComplex !== undefined ? patch.isComplex : current.isComplex;
      const scheduled = patch.scheduled !== undefined ? patch.scheduled : current.scheduled;
      const finishDate = patch.finishDate !== undefined ? patch.finishDate : current.finishDate;
      const dueTime = patch.dueTime !== undefined ? patch.dueTime || undefined : current.dueTime;
      const resolved = resolveComplex(isComplex, scheduled, finishDate, dueTime);

      if (patch.isComplex !== undefined) col("is_complex", isComplex);
      if (resolved.finishDate !== current.finishDate) col("finish_date", resolved.finishDate ?? null);
      if (resolved.dueTime !== current.dueTime) col("due_time", resolved.dueTime ?? null);
    } else if (patch.scheduled !== undefined && current.isComplex) {
      // Re-check the range invariant when only the start day moves.
      resolveComplex(true, patch.scheduled, current.finishDate, current.dueTime);
    }

    let completing = false;
    let reopening = false;
    let leftStageId: string | null = null;
    const projectChanged = patch.projectId !== undefined && (patch.projectId || undefined) !== current.projectId;
    const stageChanged = patch.stageId !== undefined && (patch.stageId || undefined) !== current.stageId;

    if (projectChanged || stageChanged) {
      const projectId = patch.projectId !== undefined ? patch.projectId || undefined : current.projectId;
      // Changing project discards the old column: the new project's first open
      // column is the default unless the caller named one explicitly.
      const stageId = await resolveStage(
        tx,
        projectId,
        projectChanged && !patch.stageId ? undefined : patch.stageId || undefined,
      );
      col("project_id", projectId ?? null);
      col("stage_id", stageId);
      if (stageId !== (current.stageId ?? null)) {
        sets.push(stageId ? `stage_entered_at = now()` : `stage_entered_at = null`);
      }
      col(
        "board_order",
        stageId
          ? (
              await tx.query<{ next: number }>(
                `select coalesce(max(board_order)+1, 0) as next from tasks
                  where stage_id = $1 and status <> 'trashed'`,
                [stageId],
              )
            )[0].next
          : 0,
      );

      // Landing in (or leaving) the done column is the same event as
      // completing (or reopening) the task; both finish below, after the row
      // has its new column.
      const doneStage = projectId ? await doneStageOf(tx, projectId) : null;
      if (stageId && doneStage && stageId === doneStage.id) {
        completing = current.status === "open";
      } else if (current.status === "done") {
        col("status", "open");
        sets.push(`completed_at = null`);
        reopening = true;
      }
      leftStageId = current.stageId && current.stageId !== stageId ? current.stageId : null;
    }

    if (sets.length === 0) return current;

    vals.push(id);
    const rows = await tx.query<TaskRow>(
      `update tasks set ${sets.join(", ")} where id = $${i} returning *`,
      vals,
    );
    if (rows.length === 0) return null;
    if (leftStageId) await renumberStage(tx, leftStageId);
    if (reopening) await releaseSuccessors(tx, id);
    if (completing) {
      const done = await finishTask(tx, id);
      if (done) return done.task;
    }
    return (await hydrate(tx, rows))[0];
  });
}

/**
 * Kanban drop: place `id` at `index` within `stageId`. `index` is the position
 * among the column's non-trashed tasks (what the board renders), and board
 * order is renumbered densely in both columns. Status follows the column: a
 * drop into Done completes the task (spawning the next occurrence of a
 * recurring one), a drop of a done task anywhere else reopens it.
 */
export async function moveTaskToStage(
  id: string,
  stageId: string,
  index: number,
): Promise<Task | null> {
  return withTransaction(async (tx) => {
    const task = await getTask(id, tx);
    if (!task) return null;

    const stage = await getStage(stageId, tx);
    if (!stage || !task.projectId || stage.projectId !== task.projectId) {
      throw new TaskInvariantError("That column belongs to a different project");
    }

    const landsInDone = stage.kind === "done";
    if (landsInDone && task.status === "open") {
      await finishTask(tx, id, { index, stageId });
      return getTask(id, tx);
    }

    const from = task.stageId;
    const reopening = !landsInDone && task.status === "done";
    await tx.query(
      `update tasks set stage_id = $2${
        reopening ? `, status = 'open', completed_at = null` : ""
      }${from !== stageId ? `, stage_entered_at = now()` : ""} where id = $1`,
      [id, stageId],
    );
    await placeInStage(tx, stageId, id, index);
    if (from && from !== stageId) await renumberStage(tx, from);
    if (reopening) await releaseSuccessors(tx, id);

    return getTask(id, tx);
  });
}

/**
 * The one "task became done" path: the checkbox, a drop into Done, a patch that
 * lands in Done, and removing a lane into Done all end here. Sets status and
 * completed_at, moves a project task to the end of its done lane (or to `index`
 * for a drag), renumbers the lane it left, and creates the next occurrence of a
 * recurring task exactly once. A done task is left alone and spawns nothing; a
 * trashed task cannot be completed (null).
 */
export async function finishTask(
  tx: Tx,
  id: string,
  opts: { index?: number; stageId?: string; avoidStageId?: string } = {},
): Promise<{ task: Task; next: Task | null } | null> {
  const task = await getTask(id, tx);
  if (!task || task.status === "trashed") return null;
  if (task.status === "done") return { task, next: null };

  const doneStage = task.projectId ? await doneStageOf(tx, task.projectId) : null;
  const target = opts.stageId ?? doneStage?.id ?? null;
  const from = task.stageId ?? null;
  await tx.query(
    `update tasks
        set status = 'done', completed_at = now(),
            stage_entered_at = case when $2::uuid is not null and stage_id is distinct from $2::uuid
              then now() else stage_entered_at end,
            stage_id = coalesce($2::uuid, stage_id)
      where id = $1`,
    [id, target],
  );
  if (target) {
    await placeInStage(tx, target, id, opts.index);
    if (from && from !== target) await renumberStage(tx, from);
  }

  // The follow-up occurrence is a normal create, so it picks up the project's
  // first open column the same way any other new task does. One that already
  // links back to this task and is still open means it has been spawned.
  let next: Task | null = null;
  if (task.recurrence) {
    const existing = await tx.query<{ id: string }>(
      `select id from tasks where recurs_from = $1 and status = 'open' limit 1`,
      [id],
    );
    if (existing.length === 0) {
      const today = toISODate(new Date());
      const avoid =
        opts.avoidStageId && task.projectId
          ? await firstOpenStageOf(tx, task.projectId, opts.avoidStageId)
          : null;
      next = await insertTask(
        tx,
        {
          title: task.title,
          notes: task.notes,
          projectId: task.projectId,
          stageId: avoid?.id,
          tags: task.tags,
          scheduled: nextOccurrence(task.scheduled ?? today, task.recurrence, today),
          dueTime: task.dueTime,
          minutes: task.minutes,
          priority: task.priority,
          recurrence: task.recurrence,
        },
        id,
      );
    }
  }

  return { task: (await getTask(id, tx))!, next };
}

/** Marks done, moves to the done column, and spins up the next occurrence. */
export async function completeTask(id: string): Promise<{ task: Task; next: Task | null } | null> {
  return withTransaction((tx) => finishTask(tx, id));
}

/**
 * When a done task becomes open again, its next occurrence goes if nobody has
 * started it: still open, and no tracked time (timer entries or segments).
 * A started or finished occurrence is left alone.
 */
export async function releaseSuccessors(tx: Tx, id: string): Promise<void> {
  await tx.query(
    `delete from tasks t
      where t.recurs_from = $1 and t.status = 'open'
        and not exists (select 1 from time_entries e where e.task_id = t.id)
        and not exists (select 1 from segments s where s.task_id = t.id)`,
    [id],
  );
}

/** Reopening puts a project task back in the first column that isn't done. */
export async function reopenTask(id: string): Promise<Task | null> {
  return withTransaction(async (tx) => {
    const task = await getTask(id, tx);
    if (!task) return null;
    const stage = task.projectId ? await firstOpenStageOf(tx, task.projectId) : null;
    const rows = await tx.query<TaskRow>(
      `update tasks
          set status = 'open', completed_at = null,
              stage_entered_at = case when $2::uuid is not null and stage_id is distinct from $2::uuid
                then now() else stage_entered_at end,
              stage_id = coalesce($2::uuid, stage_id)
        where id = $1
        returning *`,
      [id, stage?.id ?? null],
    );
    if (rows.length === 0) return null;
    if (stage) {
      await placeInStage(tx, stage.id, id);
      if (task.stageId && task.stageId !== stage.id) await renumberStage(tx, task.stageId);
    }
    if (task.status === "done") await releaseSuccessors(tx, id);
    return getTask(id, tx);
  });
}

export async function trashTask(id: string): Promise<boolean> {
  return withTransaction(async (tx) => {
    const rows = await tx.query<TaskRow>(
      `update tasks set status = 'trashed', deleted_at = now() where id = $1 returning *`,
      [id],
    );
    if (rows.length === 0) return false;
    if (rows[0].stage_id) await renumberStage(tx, rows[0].stage_id);
    return true;
  });
}

/**
 * Brings a trashed task back as it was: done if it had been completed, open
 * otherwise, at the end of its column. Never spawns an occurrence. An open task
 * whose column became Done while it sat in the trash goes to the first open
 * column instead of being completed.
 */
export async function restoreTask(id: string): Promise<Task | null> {
  return withTransaction(async (tx) => {
    const task = await getTask(id, tx);
    if (!task) return null;
    if (task.status !== "trashed") return task;

    const status = task.completedAt ? "done" : "open";
    let stageId = task.stageId ?? null;
    if (stageId && status === "open") {
      const lane = await getStage(stageId, tx);
      if (lane?.kind === "done" && task.projectId) {
        stageId = (await firstOpenStageOf(tx, task.projectId))?.id ?? stageId;
      }
    }
    await tx.query(
      `update tasks
          set status = $2, deleted_at = null, stage_id = $3::uuid,
              stage_entered_at = case when $3::uuid is not null and stage_id is distinct from $3::uuid
                then now() else stage_entered_at end
        where id = $1`,
      [id, status, stageId],
    );
    if (stageId) {
      await placeInStage(tx, stageId, id);
      if (task.stageId && task.stageId !== stageId) await renumberStage(tx, task.stageId);
    }
    return getTask(id, tx);
  });
}

export async function deleteTaskForever(id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(`delete from tasks where id = $1 returning id`, [id]);
  return rows.length > 0;
}

export async function reorderTasks(orderedIds: string[]): Promise<void> {
  await withTransaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.query(`update tasks set sort_order = $1 where id = $2`, [i, orderedIds[i]]);
    }
  });
}

// ── Subtasks ───────────────────────────────────────────────────────────────

export async function addSubtask(taskId: string, title: string): Promise<Subtask> {
  const rows = await db.query<SubtaskRow>(
    `insert into subtasks (id, task_id, title, sort_order)
     values ($1,$2,$3, coalesce((select max(sort_order)+1 from subtasks where task_id=$2), 0))
     returning *`,
    [randomUUID(), taskId, title],
  );
  return rowToSubtask(rows[0]);
}

export async function updateSubtask(
  id: string,
  patch: { title?: string; done?: boolean },
): Promise<Subtask | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    vals.push(patch.title);
  }
  if (patch.done !== undefined) {
    sets.push(`done = $${i++}`);
    vals.push(patch.done);
  }
  if (sets.length === 0) return null;
  vals.push(id);
  const rows = await db.query<SubtaskRow>(
    `update subtasks set ${sets.join(", ")} where id = $${i} returning *`,
    vals,
  );
  return rows.length ? rowToSubtask(rows[0]) : null;
}

export async function deleteSubtask(id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from subtasks where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}
