import { handle, json } from "@/lib/api";
import { store } from "@/lib/store";
import * as v from "@/lib/validate";

export async function GET() {
  return handle(async () => store.listFolders());
}

export async function POST(request: Request) {
  return handle(async () => {
    const b = v.body(await json(request));
    return store.addFolder({ name: v.nonEmpty(b.name, "Folder name", 120) });
  }, 201);
}
