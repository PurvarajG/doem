"use client";

import { useState } from "react";
import { useTasks } from "@/lib/store-context";
import { STAGE_KINDS } from "@/lib/types";
import type { Project, ProjectStage, StageKind } from "@/lib/types";
import Button from "../ui/Button";
import Caption from "../ui/Caption";
import RemoveStageDialog from "./RemoveStageDialog";
import { AddStageDialog, RenameStageDialog, StageLimitDialog } from "./StageDialogs";
import { openInStage } from "./lanes";

const SELECT =
  "h-10 rounded-row bg-sunk px-3 text-body text-ink inset-ring-1 inset-ring-line-strong";

/**
 * Every lane action in one place: add, rename, reorder, limit, change what a
 * lane means, remove. The server keeps exactly one done lane and at least one
 * lane that isn't done, so the controls that would break that aren't offered.
 */
export default function LaneManager({ project }: { project: Project }) {
  const { tasks, stagesFor, addStage, renameStage, updateStage, reorderStages } = useTasks();
  const stages = stagesFor(project.id);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<ProjectStage | null>(null);
  const [limiting, setLimiting] = useState<ProjectStage | null>(null);
  const [removing, setRemoving] = useState<ProjectStage | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const notDone = stages.filter((s) => s.kind !== "done").length;

  function move(index: number, by: -1 | 1) {
    const ids = stages.map((s) => s.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void reorderStages(project.id, ids);
  }

  return (
    <section className="space-y-2" aria-labelledby="lanes-heading">
      <Caption as="h3" id="lanes-heading">
        Lanes
      </Caption>
      <p className="text-meta text-ink-3">
        The columns of this project&apos;s board, in order. A board keeps one Done lane and at least
        one other.
      </p>

      <ul className="space-y-2">
        {stages.map((stage, index) => {
          const isDone = stage.kind === "done";
          const removable = !isDone && notDone > 1;
          return (
            <li
              key={stage.id}
              className="space-y-2 rounded-row px-4 py-3 inset-ring-1 inset-ring-line"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-body font-medium text-ink">{stage.name}</p>
                <p className="text-meta text-ink-3">
                  {stage.kind}
                  {stage.wipLimit != null && ` · limit ${stage.wipLimit}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  aria-label={`Rename ${stage.name}`}
                  onClick={() => setRenaming(stage)}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  aria-label={`Limit for ${stage.name}`}
                  onClick={() => setLimiting(stage)}
                >
                  Limit
                </Button>
                <Button
                  size="sm"
                  aria-label={`Move ${stage.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </Button>
                <Button
                  size="sm"
                  aria-label={`Move ${stage.name} down`}
                  disabled={index === stages.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </Button>
                {removable && (
                  <Button
                    size="sm"
                    tone="danger"
                    aria-label={`Remove ${stage.name}`}
                    onClick={() => setRemoving(stage)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {!isDone && (
                <div className="flex items-center gap-2">
                  <label htmlFor={`lane-kind-${stage.id}`} className="text-meta text-ink-3">
                    Behaves as
                  </label>
                  <select
                    id={`lane-kind-${stage.id}`}
                    aria-label={`${stage.name} behaves as`}
                    value={stage.kind}
                    onChange={(e) => void updateStage(stage.id, { kind: e.target.value as StageKind })}
                    className={SELECT}
                  >
                    {/* The server allows one done lane, and this isn't it. */}
                    {STAGE_KINDS.filter((k) => k !== "done").map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Button icon="plus" onClick={() => setAdding(true)}>
        Add lane
      </Button>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <AddStageDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async (name, kind) => {
          await addStage(project.id, { name, kind });
          setAnnouncement(`${name} lane added.`);
        }}
      />
      <RenameStageDialog
        stage={renaming}
        onClose={() => setRenaming(null)}
        onRename={(name) => renameStage(renaming!.id, name)}
      />
      <StageLimitDialog
        stage={limiting}
        open={limiting ? openInStage(tasks, limiting.id) : 0}
        onClose={() => setLimiting(null)}
        onSave={(wipLimit) => updateStage(limiting!.id, { wipLimit })}
      />
      {removing && (
        <RemoveStageDialog
          key={removing.id}
          stage={removing}
          siblings={stages.filter((s) => s.id !== removing.id)}
          taskCount={tasks.filter((t) => t.stageId === removing.id).length}
          onClose={() => setRemoving(null)}
          onRemoved={setAnnouncement}
        />
      )}
    </section>
  );
}
