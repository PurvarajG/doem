"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTasks } from "@/lib/store-context";
import { PROJECT_COLORS, projectColorVar, type Folder, type Project } from "@/lib/types";
import { readStoredKey } from "@/lib/storage-key";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import Icon from "../ui/Icon";
import {
  GROUP_LABEL,
  NAV_COUNT,
  NAV_ROW,
  NAV_ROW_ON,
  NAV_ROW_REST,
} from "./nav-styles";

const KEY = "doem.projectsCollapsed";
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function readCollapsed(): boolean {
  try {
    return readStoredKey(KEY) === "1";
  } catch {
    return false;
  }
}

/** Projects group collapse state, remembered in localStorage. Falls back to expanded. */
function useProjectsCollapsed(): [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: the change simply isn't remembered.
    }
    for (const notify of listeners) notify();
  }, []);
  return [collapsed, setCollapsed];
}

const OPEN_KEY = "doem.sidebarOpenProject";

function readOpenProject(): string | null {
  try {
    return readStoredKey(OPEN_KEY);
  } catch {
    return null;
  }
}

/** Last opened project id, remembered in localStorage. Null when empty or storage throws. */
function useRememberedProject(): [string | null, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, readOpenProject, () => null);
  const remember = useCallback((next: string) => {
    try {
      localStorage.setItem(OPEN_KEY, next);
    } catch {
      // Storage unavailable: the change simply isn't remembered.
    }
    for (const notify of listeners) notify();
  }, []);
  return [id, remember];
}

const FOLDERS_KEY = "doem.foldersCollapsed";

function readCollapsedFolders(): string {
  try {
    return readStoredKey(FOLDERS_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Ids of collapsed folders, remembered in localStorage. Falls back to all open. */
function useCollapsedFolders(): [Set<string>, (id: string) => void] {
  // The raw string is the snapshot so useSyncExternalStore sees a stable value.
  const raw = useSyncExternalStore(subscribe, readCollapsedFolders, () => "");
  const collapsed = new Set(raw ? raw.split(",") : []);
  const toggle = useCallback((id: string) => {
    const next = new Set(readCollapsedFolders().split(",").filter(Boolean));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(FOLDERS_KEY, [...next].join(","));
    } catch {
      // Storage unavailable: the change simply isn't remembered.
    }
    for (const notify of listeners) notify();
  }, []);
  return [collapsed, toggle];
}

/** Drag payload type for moving a project between folders. */
const DRAG_TYPE = "application/x-doem-project";

/** Rows the open tree may draw before folding the rest into "N more". */
const TREE_CAP = 3;

const MUTED_ROW = `${NAV_ROW} ${NAV_ROW_REST} w-full text-left text-ink-3`;
const FIELD =
  "no-drag h-10 w-full rounded-row bg-raised px-3 text-nav-row text-ink ring-1 ring-line placeholder:text-ink-3";
const DROP_ON = "ring-1 ring-accent bg-sunk";

type PendingDelete = { kind: "project" | "folder"; id: string; name: string };

export default function ProjectTree() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    tasks,
    projects,
    addProject,
    updateProject,
    deleteProject,
    stagesFor,
    addStage,
    folders,
    addFolder,
    renameFolder,
    deleteFolder,
  } = useTasks();
  const [collapsed, setCollapsed] = useProjectsCollapsed();
  const [remembered, remember] = useRememberedProject();
  const [collapsedFolders, toggleFolder] = useCollapsedFolders();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);
  const [stageName, setStageName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const openCounts = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== "open" || !t.projectId) continue;
    openCounts.set(t.projectId, (openCounts.get(t.projectId) ?? 0) + 1);
  }

  async function createProject() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    const project = await addProject(trimmed, color);
    setName("");
    setAdding(false);
    remember(project.id);
    router.push(`/projects/${project.id}`);
  }

  async function createFolder() {
    const trimmed = folderName.trim();
    setFolderName("");
    setAddingFolder(false);
    if (trimmed) await addFolder(trimmed);
  }

  function saveRename() {
    if (!renaming) return;
    const trimmed = renaming.name.trim();
    const current = folders.find((f) => f.id === renaming.id);
    setRenaming(null);
    if (trimmed && current && trimmed !== current.name) void renameFolder(renaming.id, trimmed);
  }

  function createStage(projectId: string) {
    const trimmed = stageName.trim();
    setStageName("");
    setAddingStageFor(null);
    if (trimmed) void addStage(projectId, { name: trimmed, kind: "backlog" });
  }

  /** Drop handlers for a folder header, or for the Projects label (folderId ""). */
  function dropZone(folderId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(folderId);
      },
      onDragLeave: () => setDropTarget((t) => (t === folderId ? null : t)),
      onDrop: (e: React.DragEvent) => {
        const projectId = e.dataTransfer.getData(DRAG_TYPE);
        setDropTarget(null);
        if (!projectId) return;
        e.preventDefault();
        const project = projects.find((p) => p.id === projectId);
        if (project && (project.folderId ?? "") !== folderId) {
          void updateProject(projectId, { folderId });
        }
      },
    };
  }

  const visible = projects.filter((p) => !p.archived);
  const folderIds = new Set(folders.map((f) => f.id));
  // A project whose folder is gone (or not loaded) shows at the top level.
  const filedIn = (p: Project) => (p.folderId && folderIds.has(p.folderId) ? p.folderId : "");
  const unfiled = visible.filter((p) => filedIn(p) === "");
  // One open tree: the route's project, else the remembered one, else the first.
  const routeId = /^\/projects\/([^/]+)/.exec(pathname)?.[1];
  const openId =
    [routeId, remembered].find(
      (id) => id && visible.some((p) => p.id === id),
    ) ?? visible[0]?.id;

  function renderProject(p: Project) {
    const href = `/projects/${p.id}`;
    const active = pathname === href;
    const open = openCounts.get(p.id) ?? 0;
    const stages = p.id === openId ? stagesFor(p.id) : [];
    return (
      <div key={p.id} className="flex flex-col gap-0.5">
        <div className="no-drag group relative flex items-center">
          <Link
            href={href}
            onClick={() => remember(p.id)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, p.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropTarget(null)}
            data-part="nav-row"
            aria-current={active ? "page" : undefined}
            className={`${NAV_ROW} flex-1 ${active ? NAV_ROW_ON : NAV_ROW_REST}`}
          >
            <span
              data-part="logo"
              aria-hidden="true"
              className="grid size-5.5 shrink-0 place-items-center rounded-logo text-logo-tile text-logo-ink shadow-logo"
              style={{ background: projectColorVar(p.color) }}
            >
              {p.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="select-text truncate">{p.name}</span>
            {open > 0 && (
              <span
                data-part="nav-count"
                aria-hidden="true"
                className={`${NAV_COUNT} group-focus-within:invisible group-hover:invisible`}
              >
                {open}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setPendingDelete({ kind: "project", id: p.id, name: p.name })}
            aria-label={`Delete ${p.name}`}
            className="absolute right-2 grid size-6 place-items-center rounded-tile text-ink-3 opacity-0 hover:bg-sunk hover:text-ink focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        {p.id === openId && (
          <div
            data-part="tree"
            className="relative ml-5.5 flex flex-col gap-0.5 pl-3 before:absolute before:inset-y-1 before:left-0 before:w-px before:bg-line-2 before:content-['']"
          >
            {(stages.length > TREE_CAP
              ? stages.slice(0, TREE_CAP - 1)
              : stages
            ).map((s) => (
              <Link
                key={s.id}
                href={href}
                onClick={() => remember(p.id)}
                data-part="tree-row"
                className={`${NAV_ROW} ${NAV_ROW_REST} h-9 text-body font-normal`}
              >
                <Icon name="folder" size={16} />
                <span className="select-text truncate">{s.name}</span>
              </Link>
            ))}
            {stages.length > TREE_CAP && (
              <Link
                href={href}
                onClick={() => remember(p.id)}
                data-part="tree-more"
                className={`${NAV_ROW} ${NAV_ROW_REST} h-9 text-body font-normal text-ink-3`}
              >
                <Icon name="more" size={16} />
                <span className="truncate">
                  {stages.length - (TREE_CAP - 1)} more
                </span>
              </Link>
            )}
            {addingStageFor === p.id ? (
              <input
                autoFocus
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createStage(p.id);
                  if (e.key === "Escape") {
                    setAddingStageFor(null);
                    setStageName("");
                  }
                }}
                onBlur={() => createStage(p.id)}
                placeholder="List name"
                aria-label="List name"
                className={`${FIELD} h-9 text-body`}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingStageFor(p.id)}
                className={`${MUTED_ROW} h-9 text-body`}
              >
                <Icon name="plus" size={16} />
                <span>Add list</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderFolder(f: Folder) {
    const inside = visible.filter((p) => filedIn(p) === f.id);
    const isCollapsed = collapsedFolders.has(f.id);
    return (
      <div key={f.id} className="flex flex-col gap-0.5">
        <div
          {...dropZone(f.id)}
          data-part="folder-row"
          className={`no-drag group relative flex items-center rounded-row ${dropTarget === f.id ? DROP_ON : ""}`}
        >
          {renaming?.id === f.id ? (
            <input
              autoFocus
              value={renaming.name}
              onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={saveRename}
              aria-label="Folder name"
              className={FIELD}
            />
          ) : (
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => toggleFolder(f.id)}
              onDoubleClick={() => setRenaming({ id: f.id, name: f.name })}
              title="Double-click to rename"
              className={`${NAV_ROW} ${NAV_ROW_REST} flex-1 text-left`}
            >
              <Icon name="folder" size={16} />
              <span className="truncate">{f.name}</span>
              <span
                aria-hidden="true"
                className={`ml-auto text-ink-3 transition-transform group-focus-within:invisible group-hover:invisible ${isCollapsed ? "rotate-180" : ""}`}
              >
                <Icon name="chevup" size={14} />
              </span>
            </button>
          )}
          {renaming?.id !== f.id && (
            <button
              type="button"
              onClick={() => setPendingDelete({ kind: "folder", id: f.id, name: f.name })}
              aria-label={`Delete folder ${f.name}`}
              className="absolute right-2 grid size-6 place-items-center rounded-tile text-ink-3 opacity-0 hover:bg-sunk hover:text-ink focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        {!isCollapsed && (
          <div className="ml-3 flex flex-col gap-0.5">
            {inside.map(renderProject)}
            {inside.length === 0 && (
              <p className="px-3 py-1.5 text-meta text-ink-3">Drag projects here</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        {...dropZone("")}
        data-part="lbl-s"
        className={`${GROUP_LABEL} rounded-row ${dropTarget === "" ? DROP_ON : ""}`}
      >
        Projects
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand projects" : "Collapse projects"}
          onClick={() => setCollapsed(!collapsed)}
          className={`-my-1 grid size-6 place-items-center rounded-tile text-ink-3 hover:text-ink ${collapsed ? "rotate-180" : ""}`}
        >
          <Icon name="chevup" size={14} />
        </button>
      </div>
      {!collapsed && (
        <nav aria-label="Projects" className="flex flex-col gap-0.5">
          {unfiled.map(renderProject)}
          {folders.map(renderFolder)}

          {adding ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createProject();
                if (e.key === "Escape") {
                  setAdding(false);
                  setName("");
                }
              }}
              onBlur={() => void createProject()}
              placeholder="Project name"
              aria-label="Project name"
              className={FIELD}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={MUTED_ROW}
            >
              <Icon name="plus" size={16} />
              <span>New project</span>
            </button>
          )}
          {addingFolder ? (
            <input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
                if (e.key === "Escape") {
                  setAddingFolder(false);
                  setFolderName("");
                }
              }}
              onBlur={() => void createFolder()}
              placeholder="Folder name, like Work or Home"
              aria-label="Folder name"
              className={FIELD}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingFolder(true)}
              className={MUTED_ROW}
            >
              <Icon name="folder" size={16} />
              <span>New folder</span>
            </button>
          )}
        </nav>
      )}

      <Dialog
        role="alertdialog"
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={
          pendingDelete?.kind === "folder"
            ? `Delete folder "${pendingDelete.name}"?`
            : `Delete "${pendingDelete?.name ?? ""}"?`
        }
        description={
          pendingDelete?.kind === "folder"
            ? "Its projects stay and move back to the top of the list."
            : "Its tasks move to No project."
        }
        initialFocusRef={cancelRef}
        actions={
          <>
            <Button
              ref={cancelRef}
              variant="ghost"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              tone="danger"
              onClick={() => {
                if (pendingDelete?.kind === "folder") void deleteFolder(pendingDelete.id);
                else if (pendingDelete) void deleteProject(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
