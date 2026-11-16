import { handle, json } from "@/lib/api";
import { store } from "@/lib/store";
import * as v from "@/lib/validate";

export async function PATCH(request: Request, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const b = v.body(await json(request));
    return store.renameFolder(v.uuid(id, "folder id"), v.nonEmpty(b.name, "Folder name", 120));
  });
}

/** Removes the folder only. Its projects move back to the top level. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const removed = await store.deleteFolder(v.uuid(id, "folder id"));
    return removed ? { ok: true } : null;
  });
}
