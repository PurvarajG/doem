"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTasks } from "@/lib/store-context";
import { useBoardDrag } from "@/lib/useBoardDrag";
import { readStoredKey } from "@/lib/storage-key";
import { BOARD_TEMPLATES, guessStageKind, templateSummary } from "@/lib/board-templates";
import type { Project, ProjectStage } from "@/lib/types";
import Icon from "../ui/Icon";
import Column from "./Column";
import RemoveStageDialog from "./RemoveStageDialog";
import { StageLimitDialog } from "./StageDialogs";
import { openInStage } from "./lanes";

type Fade = "start" | "end" | "both" | undefined;

const STRIP_KEY = "doem.templateStripHidden";
const stripListeners = new Set<() => void>();

function subscribeStrip(notify: () => void) {
  stripListeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    stripListeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function readHiddenStrips(): string {
  try {
    return readStoredKey(STRIP_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Whether this project's "Start from a template" strip has been used or
 * closed. Remembered in localStorage; if storage fails it simply shows again.
 */
function useTemplateStripHidden(projectId: string): [boolean, () => void] {
  const raw = useSyncExternalStore(subscribeStrip, readHiddenStrips, () => "");
  const hidden = raw.split(",").includes(projectId);
  const hide = useCallback(() => {
    const ids = new Set(readHiddenStrips().split(",").filter(Boolean));
    ids.add(projectId);
    try {
      localStorage.setItem(STRIP_KEY, [...ids].join(","));
    } catch {
      // Storage unavailable: the strip comes back next visit.
    }
    for (const notify of stripListeners) notify();
  }, [projectId]);
  return [hidden, hide];
}

export default function Board({
  project,
  todayISO,
}: {
  project: Project;
  todayISO: string;
}) {
  const {
    tasks,
    stagesFor,
    moveTask,
    addStage,
    reorderStages,
    updateStage,
    applyBoardTemplate,
    customTemplates,
  } = useTasks();
  const [addingLane, setAddingLane] = useState(false);
  const [laneName, setLaneName] = useState("");
  const [limitFor, setLimitFor] = useState<ProjectStage | null>(null);
  const [removing, setRemoving] = useState<ProjectStage | null>(null);
  /** Announced politely after a move, whether it came from drag or keyboard. */
  const [announcement, setAnnouncement] = useState("");
  const [fade, setFade] = useState<Fade>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stages = stagesFor(project.id);

  const byStage = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const stage of stages) map.set(stage.id, []);
    for (const task of tasks) {
      if (
        task.status === "trashed" ||
        task.projectId !== project.id ||
        !task.stageId
      )
        continue;
      map.get(task.stageId)?.push(task);
    }
    for (const list of map.values())
      list.sort((a, b) => a.boardOrder - b.boardOrder);
    return map;
  }, [tasks, stages, project.id]);

  const isEmpty = [...byStage.values()].every((list) => list.length === 0);
  const [stripHidden, hideStrip] = useTemplateStripHidden(project.id);
  const templates = [...BOARD_TEMPLATES, ...customTemplates];

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hiddenStart = el.scrollLeft > 1;
    const hiddenEnd = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade(
      hiddenStart && hiddenEnd
        ? "both"
        : hiddenStart
          ? "start"
          : hiddenEnd
            ? "end"
            : undefined,
    );
  }, []);

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, stages.length]);

  const announceMove = useCallback(
    (taskId: string, stageId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      const stage = stages.find((s) => s.id === stageId);
      if (task && stage)
        setAnnouncement(`${task.title} moved to ${stage.name}.`);
    },
    [tasks, stages],
  );

  const onMove = useCallback(
    (taskId: string, stageId: string, index: number) => {
      moveTask(taskId, stageId, index);
      announceMove(taskId, stageId);
    },
    [moveTask, announceMove],
  );

  const { dragTaskId, target, cardProps, columnProps } = useBoardDrag(onMove);

  /** Adds a column just before Done, so the finish line stays last. */
  async function createLane(keepOpen: boolean) {
    const name = laneName.trim().slice(0, 80);
    setLaneName("");
    if (!keepOpen) setAddingLane(false);
    if (!name) return;
    const created = await addStage(project.id, { name, kind: guessStageKind(name) });
    if (!created) return;
    const open = stages.filter((s) => s.kind !== "done").map((s) => s.id);
    const done = stages.filter((s) => s.kind === "done").map((s) => s.id);
    if (done.length) await reorderStages(project.id, [...open, created.id, ...done]);
    setAnnouncement(`${name} column added.`);
  }

  function swap(index: number, offset: -1 | 1) {
    const ids = stages.map((s) => s.id);
    const other = index + offset;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    void reorderStages(project.id, ids);
  }

  const openColumns = stages.filter((s) => s.kind !== "done").length;
  const currentTemplate = templates.find(
    (t) =>
      t.stages.length === stages.length &&
      t.stages.every((s, i) => s.name === stages[i].name),
  )?.id;

  return (
    <>
      {isEmpty && !stripHidden && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-meta text-ink-3">Start from a template:</span>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              title={templateSummary(t)}
              aria-pressed={currentTemplate === t.id}
              onClick={async () => {
                if (await applyBoardTemplate(project.id, t.id)) {
                  hideStrip();
                  setAnnouncement(`${t.name} template applied.`);
                }
              }}
              className={`h-8 rounded-full px-3 text-secondary inset-ring-1 hover:bg-sunk ${
                currentTemplate === t.id
                  ? "text-ink inset-ring-line-strong"
                  : "text-ink-2 inset-ring-line-2"
              }`}
            >
              {t.name}
            </button>
          ))}
          <button
            type="button"
            aria-label="Hide templates"
            title="Hide. Templates stay in Project settings."
            onClick={hideStrip}
            className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-sunk hover:text-ink"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* The only horizontal scroller on the page. The p-1 -m-1 gutter keeps lane edges and card shadows from being clipped. */}
      <div
        ref={scrollRef}
        onScroll={measure}
        data-fade={fade}
        className="board-scroll -m-1 p-1"
      >
        <div className="flex min-w-full items-start gap-4">
          <div className="grid flex-1 auto-cols-[minmax(14rem,1fr)] grid-flow-col items-start gap-4">
            {stages.map((stage, index) => (
              <Column
                key={stage.id}
                stage={stage}
                stages={stages}
                tasks={byStage.get(stage.id) ?? []}
                todayISO={todayISO}
                projectId={project.id}
                dragTaskId={dragTaskId}
                dropIndex={target?.stageId === stage.id ? target.index : null}
                cardProps={cardProps}
                columnProps={columnProps}
                onMove={onMove}
                laneActions={{
                  moveLeft: index > 0 ? () => swap(index, -1) : undefined,
                  moveRight: index < stages.length - 1 ? () => swap(index, 1) : undefined,
                  setLimit: () => setLimitFor(stage),
                  remove:
                    stage.kind !== "done" && openColumns > 1
                      ? () => setRemoving(stage)
                      : undefined,
                }}
              />
            ))}
          </div>

          {addingLane ? (
            <input
              autoFocus
              value={laneName}
              onChange={(e) => setLaneName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createLane(true);
                if (e.key === "Escape") {
                  setLaneName("");
                  setAddingLane(false);
                }
              }}
              onBlur={() => void createLane(false)}
              placeholder="Column name, then Enter"
              aria-label="New column name"
              className="h-10 w-56 shrink-0 rounded-tab bg-surface px-3 text-body text-ink ring-1 ring-line placeholder:text-ink-3"
            />
          ) : (
            <button
              type="button"
              aria-label="Add lane"
              title="Add lane"
              onClick={() => setAddingLane(true)}
              className="grid size-10 shrink-0 place-items-center rounded-tab text-ink-3 inset-ring-1 inset-ring-line-2 hover:bg-sunk"
            >
              <Icon name="plus" />
            </button>
          )}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <StageLimitDialog
        stage={limitFor}
        open={limitFor ? openInStage(byStage.get(limitFor.id) ?? [], limitFor.id) : 0}
        onClose={() => setLimitFor(null)}
        onSave={async (limit) => {
          if (limitFor) await updateStage(limitFor.id, { wipLimit: limit });
        }}
      />

      {removing && (
        <RemoveStageDialog
          stage={removing}
          siblings={stages.filter((s) => s.id !== removing.id)}
          taskCount={byStage.get(removing.id)?.length ?? 0}
          onClose={() => setRemoving(null)}
          onRemoved={(message) => setAnnouncement(message)}
        />
      )}
    </>
  );
}
