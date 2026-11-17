"use client";

import { useEffect, useState } from "react";
import { fmt, fmtClock } from "@/lib/format";
import { gapHints, type GapHint } from "@/lib/gap-hints";
import { useTasks } from "@/lib/store-context";
import type { Gap } from "@/lib/types";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import CategoryPicker from "./CategoryPicker";
import TaskPicker from "./TaskPicker";

type Part = { description: string; categoryId?: string; taskId?: string };

const EMPTY: Part = { description: "" };
const MINUTE = 60_000;

/**
 * The first moment at local "HH:MM" that falls within [start, end], checking
 * each calendar day the gap touches. Null when the time never occurs in it.
 */
export function resolveCut(hhmm: string, startMs: number, endMs: number): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const day = new Date(startMs);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() <= endMs) {
    const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
    if (t >= startMs && t <= endMs) return t;
    day.setDate(day.getDate() + 1);
  }
  return null;
}

const hasSubject = (p: Part) => !!p.taskId || !!p.categoryId;

/**
 * Accounts for an untracked gap. The user says what happened: they cut the gap
 * into parts at times they choose, and give each part a description and a
 * category or task. Nothing is preselected. "Seen by Doem" offers lock and
 * sleep times as cut points, which change nothing until tapped. Parts left
 * without a category or task stay as gaps. Shared by the gaps module and the ribbon.
 */
export default function GapFillForm({ gap, dayISO, onFilled }: { gap: Gap; dayISO: string; onFilled: () => void }) {
  const { categories, tasks, projects, settings, fillGap } = useTasks();
  const startMs = new Date(gap.startedAt).getTime();
  const endMs = new Date(gap.endedAt).getTime();

  const [cuts, setCuts] = useState<number[]>([]);
  const [parts, setParts] = useState<Part[]>([EMPTY]);
  const [cutInput, setCutInput] = useState("");
  const [cutError, setCutError] = useState<string | null>(null);
  const [hints, setHints] = useState<GapHint[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const getPresence = typeof window === "undefined" ? undefined : window.doem?.getPresence;
    if (!getPresence || !settings) return;
    let cancelled = false;
    getPresence(gap.startedAt, gap.endedAt)
      .then((spans) => {
        if (!cancelled) setHints(gapHints(gap, spans, settings, dayISO));
      })
      .catch(() => {
        if (!cancelled) setHints(gapHints(gap, [], settings, dayISO));
      });
    return () => {
      cancelled = true;
    };
  }, [gap, settings, dayISO]);

  const edges = [startMs, ...cuts, endMs];

  function addCut(t: number) {
    setCutError(null);
    if (t <= startMs || t >= endMs || cuts.includes(t)) return;
    const index = cuts.filter((c) => c < t).length;
    setCuts([...cuts.slice(0, index), t, ...cuts.slice(index)]);
    // The earlier half keeps what was entered; the later half starts empty.
    setParts([...parts.slice(0, index + 1), EMPTY, ...parts.slice(index + 1)]);
  }

  function addTypedCut() {
    if (!cutInput) return;
    const t = resolveCut(cutInput, startMs, endMs);
    if (t === null) {
      setCutError("That time is outside this gap.");
      return;
    }
    addCut(t);
    setCutInput("");
  }

  function removeCut(index: number) {
    setCuts(cuts.filter((_, i) => i !== index));
    // The merged part keeps the earlier part's values.
    setParts(parts.filter((_, i) => i !== index + 1));
  }

  function patchPart(index: number, patch: Partial<Part>) {
    setParts(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function save() {
    if (saving || !parts.some(hasSubject)) return;
    setSaving(true);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!hasSubject(part)) continue;
      const ok = await fillGap({
        startedAt: new Date(edges[i]).toISOString(),
        endedAt: new Date(edges[i + 1]).toISOString(),
        ...(part.taskId ? { taskId: part.taskId } : { categoryId: part.categoryId }),
        note: part.description.trim() || undefined,
      });
      // Stop at the first failure and keep the form open; what saved stays saved.
      if (!ok) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onFilled();
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-row bg-sunk p-3">
      {hints && hints.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Seen by Doem">
          <span className="text-meta text-ink-3">Seen by Doem</span>
          {hints.map((hint) => (
            <Button key={hint.at} variant="chip" size="sm" onClick={() => addCut(new Date(hint.at).getTime())}>
              {hint.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="time"
          aria-label="Cut at"
          value={cutInput}
          onChange={(e) => {
            setCutInput(e.target.value);
            setCutError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTypedCut();
          }}
          wrapperClassName="w-32 bg-surface font-mono"
        />
        <Button variant="chip" size="sm" icon="plus" onClick={addTypedCut}>
          Add a cut
        </Button>
        {cuts.map((cut, i) => (
          <span
            key={cut}
            className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 font-mono text-meta text-ink-2 inset-ring-1 inset-ring-line-2"
          >
            {fmtClock(new Date(cut))}
            <button
              type="button"
              aria-label={`Remove cut at ${fmtClock(new Date(cut))}`}
              onClick={() => removeCut(i)}
              className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-ink"
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        {cutError && (
          <span role="alert" className="text-meta text-hi">
            {cutError}
          </span>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {parts.map((part, i) => {
          const from = fmtClock(new Date(edges[i]));
          const to = fmtClock(new Date(edges[i + 1]));
          const minutes = Math.round((edges[i + 1] - edges[i]) / MINUTE);
          return (
            <li key={edges[i]} className="flex flex-col gap-2 rounded-row bg-surface p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-secondary text-ink">
                  {from} to {to}
                </span>
                <span className="text-meta text-ink-3">{fmt(minutes)}</span>
              </div>
              <Input
                aria-label={`What did you do from ${from} to ${to}`}
                value={part.description}
                onChange={(e) => patchPart(i, { description: e.target.value })}
                placeholder="What did you do?"
                maxLength={500}
              />
              <div className="flex flex-wrap items-center gap-2">
                {part.taskId ? (
                  <TaskPicker
                    tasks={tasks}
                    projects={projects}
                    value={part.taskId}
                    onChange={(taskId) => patchPart(i, { taskId })}
                    clearable
                  />
                ) : (
                  <>
                    <CategoryPicker
                      categories={categories}
                      value={part.categoryId}
                      onChange={(categoryId) => patchPart(i, { categoryId })}
                      label={`Category, ${from} to ${to}`}
                    />
                    <span className="text-meta text-ink-3">or</span>
                    <TaskPicker
                      tasks={tasks}
                      projects={projects}
                      value={part.taskId}
                      onChange={(taskId) => patchPart(i, { taskId })}
                      placeholder="Link a task"
                    />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onFilled}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={!parts.some(hasSubject) || saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
