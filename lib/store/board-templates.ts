import { randomUUID } from "node:crypto";
import { templateProblem, type BoardTemplate } from "../board-templates";
import type { StageInput } from "../types";
import { Invalid } from "../validate";
import { db, ts } from "./rows";

type BoardTemplateRow = {
  id: string;
  name: string;
  stages: StageInput[] | string;
  created_at: string;
};

function rowToTemplate(r: BoardTemplateRow): BoardTemplate & { createdAt: string } {
  const stages = typeof r.stages === "string" ? (JSON.parse(r.stages) as StageInput[]) : r.stages;
  return { id: r.id, name: r.name, stages, custom: true, createdAt: ts(r.created_at) };
}

/** Templates the user saved, oldest first. */
export async function listBoardTemplates() {
  const rows = await db.query<BoardTemplateRow>(
    `select * from board_templates order by created_at asc`,
  );
  return rows.map(rowToTemplate);
}

export async function getBoardTemplate(id: string) {
  const rows = await db.query<BoardTemplateRow>(`select * from board_templates where id = $1`, [id]);
  return rows.length ? rowToTemplate(rows[0]) : null;
}

export async function saveBoardTemplate(input: { name: string; stages: StageInput[] }) {
  const problem = templateProblem(input.stages);
  if (problem) throw new Invalid(problem);
  const stages = input.stages.map((s) => ({ name: s.name, kind: s.kind }));
  const rows = await db.query<BoardTemplateRow>(
    `insert into board_templates (id, name, stages) values ($1, $2, $3::jsonb) returning *`,
    [randomUUID(), input.name, JSON.stringify(stages)],
  );
  return rowToTemplate(rows[0]);
}

/** Deleting a template never touches boards already made from it. */
export async function deleteBoardTemplate(id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from board_templates where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}
