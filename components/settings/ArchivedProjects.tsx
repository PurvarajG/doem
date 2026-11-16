"use client";

import SettingRow from "@/components/settings/SettingRow";
import Button from "@/components/ui/Button";
import { useTasks } from "@/lib/store-context";
import { projectColorVar } from "@/lib/types";

/** The only place archived projects are listed; the sidebar hides them. */
export default function ArchivedProjects() {
  const { projects, tasks, updateProject } = useTasks();
  const archived = projects.filter((p) => p.archived);

  if (archived.length === 0) {
    return <p className="px-5 pb-4 text-meta text-ink-3">No archived projects.</p>;
  }

  return (
    <ul className="task-list px-2 pb-2">
      {archived.map((p) => {
        const count = tasks.filter((t) => t.projectId === p.id).length;
        return (
          <SettingRow
            key={p.id}
            label={
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: projectColorVar(p.color) }}
                />
                <span className="truncate">{p.name}</span>
              </span>
            }
            description={`${count} ${count === 1 ? "task" : "tasks"}`}
            control={
              <Button
                variant="chip"
                size="sm"
                aria-label={`Un-archive ${p.name}`}
                onClick={() => updateProject(p.id, { archived: false })}
              >
                Un-archive
              </Button>
            }
          />
        );
      })}
    </ul>
  );
}
