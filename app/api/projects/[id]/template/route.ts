import { handle, json } from "@/lib/api";
import { findTemplate } from "@/lib/board-templates";
import { store } from "@/lib/store";
import * as v from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Replaces the board's columns with a template's: a built-in one by its short
 * id, or one the user saved by its uuid. Returns the new columns and the
 * project's tasks, since tasks may have moved column.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const b = v.body(await json(request));
    const projectId = v.uuid(id, "project id");
    const key = v.nonEmpty(b.template, "template", 64);
    const template = findTemplate(key) ?? (await store.getBoardTemplate(v.uuid(key, "template")));
    if (!template || !(await store.getProject(projectId))) return null;
    const stages = await store.applyStageTemplate(projectId, template.stages);
    const tasks = (await store.allTasks()).filter((t) => t.projectId === projectId);
    return { stages, tasks };
  });
}
