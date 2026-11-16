import { handle } from "@/lib/api";
import { store } from "@/lib/store";
import * as v from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

/** Boards already made from the template keep their columns. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const removed = await store.deleteBoardTemplate(v.uuid(id, "template id"));
    return removed ? { ok: true } : null;
  });
}
