import { randomUUID } from "node:crypto";
import type { Folder } from "../types";
import { db, rowToFolder, type FolderRow } from "./rows";

export async function listFolders(): Promise<Folder[]> {
  const rows = await db.query<FolderRow>(
    `select * from folders order by sort_order asc, created_at asc`,
  );
  return rows.map(rowToFolder);
}

export async function addFolder(input: { name: string }): Promise<Folder> {
  const rows = await db.query<FolderRow>(
    `insert into folders (id, name, sort_order)
     values ($1, $2, coalesce((select max(sort_order)+1 from folders), 0))
     returning *`,
    [randomUUID(), input.name],
  );
  return rowToFolder(rows[0]);
}

export async function renameFolder(id: string, name: string): Promise<Folder | null> {
  const rows = await db.query<FolderRow>(
    `update folders set name = $1 where id = $2 returning *`,
    [name, id],
  );
  return rows.length ? rowToFolder(rows[0]) : null;
}

/** Its projects stay, just unfiled (folder_id is `on delete set null`). */
export async function deleteFolder(id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from folders where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}
