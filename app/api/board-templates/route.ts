import { handle, json } from "@/lib/api";
import { MAX_TEMPLATE_STAGES } from "@/lib/board-templates";
import { store } from "@/lib/store";
import * as v from "@/lib/validate";

export async function GET() {
  return handle(async () => store.listBoardTemplates());
}

/** Saves a column set, usually a board's current columns, as a reusable template. */
export async function POST(request: Request) {
  return handle(async () => {
    const b = v.body(await json(request));
    if (!Array.isArray(b.stages) || b.stages.length > MAX_TEMPLATE_STAGES) {
      v.fail(`stages must be a list of up to ${MAX_TEMPLATE_STAGES} columns`);
    }
    const stages = (b.stages as unknown[]).map((raw) => {
      const s = v.body(raw);
      return { name: v.nonEmpty(s.name, "Column name", 80), kind: v.stageKind(s.kind, "kind") };
    });
    return store.saveBoardTemplate({ name: v.nonEmpty(b.name, "Template name", 60), stages });
  }, 201);
}
