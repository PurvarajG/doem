"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "@/lib/store-context";
import { PROJECT_COLORS, projectColorVar, type Project } from "@/lib/types";
import SidePanel from "./ui/SidePanel";
import { Field, SavingInput } from "./ui/Field";
import Toggle from "./ui/Toggle";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import Caption from "./ui/Caption";
import CategoryPicker from "./tracking/CategoryPicker";
import { BOARD_TEMPLATES, templateSummary } from "@/lib/board-templates";

/**
 * Reached from an explicit Settings action in the project header, rather than
 * by discovering that the title happens to be clickable.
 */
export default function ProjectSettings({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const router = useRouter();
  const {
    tasks,
    categories,
    folders,
    updateProject,
    deleteProject,
    applyBoardTemplate,
    customTemplates,
    saveBoardTemplate,
    deleteBoardTemplate,
    stagesFor,
  } = useTasks();
  const [confirming, setConfirming] = useState(false);
  const [templateId, setTemplateId] = useState(BOARD_TEMPLATES[0].id);
  const [confirmingTemplate, setConfirmingTemplate] = useState(false);
  const [savingAs, setSavingAs] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState("");
  const allTemplates = [...BOARD_TEMPLATES, ...customTemplates];
  const template = allTemplates.find((t) => t.id === templateId) ?? BOARD_TEMPLATES[0];
  const columns = stagesFor(project.id);

  async function applyTemplate() {
    setConfirmingTemplate(false);
    await applyBoardTemplate(project.id, template.id);
  }

  async function saveTemplate() {
    const name = savingAs?.trim();
    setSavingAs(null);
    if (!name) return;
    const saved = await saveBoardTemplate(name.slice(0, 60), columns);
    if (saved) {
      setTemplateId(saved.id);
      setSavedNote(`Saved "${saved.name}". It's now in every board's template list.`);
    }
  }

  const affected = tasks.filter((t) => t.projectId === project.id).length;

  const consequence =
    affected === 0
      ? "This project has no tasks."
      : `${affected} ${affected === 1 ? "task keeps" : "tasks keep"} existing, but ${
          affected === 1 ? "it moves" : "they move"
        } to no project and lose their column.`;

  return (
    <SidePanel open onClose={onClose} title="Project settings">
      <div className="space-y-5">
        <SavingInput
          id="project-name"
          label="Name"
          value={project.name}
          onSave={(name) => name.trim() && updateProject(project.id, { name: name.trim() })}
        />

        <Field label="Colour">
          <div className="flex flex-wrap items-center gap-2">
            {PROJECT_COLORS.map((c) => {
              const preview = projectColorVar(c);
              return (
              <button
                key={c}
                onClick={() => updateProject(project.id, { color: c })}
                aria-label={`Use colour ${c}`}
                aria-pressed={project.color === c}
                className="flex size-8 items-center justify-center rounded-full"
              >
                <span
                  className="size-5 rounded-full"
                  style={{
                    background: preview,
                    boxShadow: project.color === c ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${preview}` : undefined,
                  }}
                />
                {/* Colour alone never carries the choice. */}
                {project.color === c && <span className="sr-only">Selected</span>}
              </button>
              );
            })}
          </div>
        </Field>

        <Field label="Folder" htmlFor="project-folder">
          <select
            id="project-folder"
            value={folders.some((f) => f.id === project.folderId) ? project.folderId : ""}
            onChange={(e) => updateProject(project.id, { folderId: e.target.value })}
            className="h-10 w-full rounded-row bg-sunk px-3 text-body text-ink inset-ring-1 inset-ring-line-strong"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Board template" htmlFor="project-template">
          <div className="flex gap-2">
            <select
              id="project-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-row bg-sunk px-3 text-body text-ink inset-ring-1 inset-ring-line-strong"
            >
              <optgroup label="Built in">
                {BOARD_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}: {templateSummary(t)}
                  </option>
                ))}
              </optgroup>
              {customTemplates.length > 0 && (
                <optgroup label="Your templates">
                  {customTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}: {templateSummary(t)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Button onClick={() => (affected > 0 ? setConfirmingTemplate(true) : void applyTemplate())}>
              Apply
            </Button>
            {template.custom && (
              <Button
                variant="ghost"
                tone="danger"
                aria-label={`Delete template ${template.name}`}
                onClick={() => {
                  void deleteBoardTemplate(template.id);
                  setTemplateId(BOARD_TEMPLATES[0].id);
                  setSavedNote("");
                }}
              >
                Delete
              </Button>
            )}
          </div>
          <p className="mt-1 text-meta text-ink-3">
            Replaces the board&apos;s columns. Tasks move to the column with the same name or type, and done
            tasks stay done.
          </p>
          {savingAs === null ? (
            <button
              type="button"
              onClick={() => {
                setSavedNote("");
                setSavingAs(`${project.name} board`);
              }}
              className="mt-2 text-secondary text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink"
            >
              Save these columns as a template
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                value={savingAs}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setSavingAs(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTemplate();
                  if (e.key === "Escape") setSavingAs(null);
                }}
                aria-label="Template name"
                placeholder="Template name"
                className="h-10 min-w-0 flex-1 rounded-row bg-sunk px-3 text-body text-ink inset-ring-1 inset-ring-line-strong placeholder:text-ink-3"
              />
              <Button variant="primary" onClick={() => void saveTemplate()}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setSavingAs(null)}>
                Cancel
              </Button>
            </div>
          )}
          {savingAs !== null && (
            <p className="mt-1 text-meta text-ink-3">Saves {columns.map((s) => s.name).join(" · ")}.</p>
          )}
          {savedNote && (
            <p role="status" className="mt-1 text-meta text-ink-2">
              {savedNote}
            </p>
          )}
        </Field>

        <Field label="Timer category">
          <CategoryPicker
            categories={categories}
            value={project.defaultCategoryId}
            onChange={(categoryId) => updateProject(project.id, { defaultCategoryId: categoryId })}
          />
          <p className="mt-1 text-meta text-ink-3">
            Starting a timer on one of this project&apos;s tasks lands here instead of Focus Work.
          </p>
        </Field>

        <div className="flex items-center justify-between gap-4 rounded-row px-4 py-3 inset-ring-1 inset-ring-line">
          <div>
            <p className="text-body font-medium text-ink">Archived</p>
            <p className="text-meta text-ink-3">
              Hides the project from the sidebar. Its tasks stay where they are.
            </p>
          </div>
          <Toggle
            on={project.archived}
            label="Archived"
            onChange={() => updateProject(project.id, { archived: !project.archived })}
          />
        </div>

        <section className="space-y-2">
          <Caption as="h3">Delete permanently</Caption>
          <p className="text-meta text-ink-3">{consequence}</p>
          <Button onClick={() => setConfirming(true)}>Delete this project</Button>
        </section>
      </div>

      <Dialog
        open={confirmingTemplate}
        onClose={() => setConfirmingTemplate(false)}
        role="alertdialog"
        title={`Switch to the ${template.name} board?`}
        description={`Columns become ${templateSummary(template)}. ${affected} ${
          affected === 1 ? "task moves" : "tasks move"
        } to the column with the same name or type. Nothing is deleted.`}
        actions={
          <>
            <Button onClick={() => setConfirmingTemplate(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void applyTemplate()}>
              Switch board
            </Button>
          </>
        }
      />

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        role="alertdialog"
        title={`Delete ${project.name}?`}
        description={consequence}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              tone="danger"
              onClick={async () => {
                setConfirming(false);
                await deleteProject(project.id);
                onClose();
                router.push("/all");
              }}
            >
              Yes, delete {project.name}
            </Button>
          </>
        }
      />
    </SidePanel>
  );
}
