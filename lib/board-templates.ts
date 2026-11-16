import { DEFAULT_STAGES, type StageInput, type StageKind } from "./types";

/**
 * Ready-made column sets for a project board. Each one has exactly one done
 * column and at least one that isn't, the same rule every board follows.
 */
export type BoardTemplate = {
  id: string;
  name: string;
  stages: StageInput[];
  /** True for templates the user saved; false or absent for built-ins. */
  custom?: boolean;
};

/** Most columns a saved template may hold. */
export const MAX_TEMPLATE_STAGES = 12;

/** Why a column set can't be a template, or null when it can. */
export function templateProblem(stages: StageInput[]): string | null {
  if (stages.length < 2 || stages.length > MAX_TEMPLATE_STAGES) {
    return `A template needs between 2 and ${MAX_TEMPLATE_STAGES} columns`;
  }
  if (stages.filter((s) => s.kind === "done").length !== 1) {
    return "A template needs exactly one done column";
  }
  return null;
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: "standard", name: "Standard", stages: DEFAULT_STAGES },
  {
    id: "simple",
    name: "Simple",
    stages: [
      { name: "To do", kind: "backlog" },
      { name: "Doing", kind: "active" },
      { name: "Done", kind: "done" },
    ],
  },
  {
    id: "software",
    name: "Software",
    stages: [
      { name: "Backlog", kind: "backlog" },
      { name: "In Progress", kind: "active" },
      { name: "Review", kind: "active" },
      { name: "Blocked", kind: "blocked" },
      { name: "Shipped", kind: "done" },
    ],
  },
  {
    id: "content",
    name: "Content",
    stages: [
      { name: "Ideas", kind: "backlog" },
      { name: "Drafting", kind: "active" },
      { name: "Editing", kind: "active" },
      { name: "Published", kind: "done" },
    ],
  },
  {
    id: "pipeline",
    name: "Pipeline",
    stages: [
      { name: "Leads", kind: "backlog" },
      { name: "In talks", kind: "active" },
      { name: "Waiting", kind: "blocked" },
      { name: "Won", kind: "done" },
    ],
  },
];

export function findTemplate(id: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find((t) => t.id === id);
}

/** "Backlog · In Progress · Done", for a template picker. */
export function templateSummary(t: BoardTemplate): string {
  return t.stages.map((s) => s.name).join(" · ");
}

/**
 * How a new column should behave, guessed from its name so adding one is a
 * single text field. Anything unrecognised is a working ("active") column.
 */
export function guessStageKind(name: string): Exclude<StageKind, "done"> {
  const n = name.trim().toLowerCase();
  if (/^(backlog|ideas?|to ?do|todo|inbox|later|someday|next|up next|queue)$/.test(n)) return "backlog";
  if (/(block|waiting|on hold|stuck|paused)/.test(n)) return "blocked";
  return "active";
}
