"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ShortcutSheet from "@/components/ShortcutSheet";
import { useTasks } from "@/lib/store-context";
import { addDays, toISODate } from "@/lib/parse";
import { isTypingTarget, matchShortcut } from "@/lib/shortcuts";
import { focusWhenReady } from "@/lib/focus-when-ready";
import type { Priority } from "@/lib/types";

const SELECTED = "data-kbd-selected";
const BLOCKING = '[role="dialog"], [role="alertdialog"], [role="menu"]';
/** Widgets that use the arrow keys themselves; J and K still work there. */
const ARROW_WIDGETS = '[role="radiogroup"], [role="tablist"], [role="listbox"], [role="slider"]';

/**
 * "true" is a selection made with the keyboard: it is drawn, announced and
 * scrolled to. "hover" is the task under the pointer: the surface's own hover
 * style already shows it, so the mark only says where the keys will land.
 */
type Mode = "true" | "hover";

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-task-id]"));
}

function clearMarks() {
  document.querySelectorAll(`[${SELECTED}]`).forEach((el) => el.removeAttribute(SELECTED));
}

/**
 * Task keys and the ? sheet. Mounted once in the workspace chrome. Any element
 * with data-task-id is a target: list rows, board cards, calendar chips. The
 * highlight is a DOM attribute (the surfaces style it) so list re-renders never
 * fight it; this component only re-applies it when the task list changes.
 */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const api = useTasks();
  const [sheetOpen, setSheetOpen] = useState(false);
  // The announcement remembers the route it was made on, so a route change
  // hides it without an effect having to reset state.
  const [announced, setAnnounced] = useState({ path: pathname, text: "" });
  const selectedId = useRef<string | null>(null);
  // A task can be on screen twice (a calendar chip and its day panel row), so
  // the element is remembered too, not only the id.
  const selectedEl = useRef<HTMLElement | null>(null);
  const mode = useRef<Mode>("true");

  const latest = useRef({ api, router, pathname });
  useEffect(() => {
    latest.current = { api, router, pathname };
  });

  const setAnnouncement = useCallback((text: string) => {
    setAnnounced({ path: latest.current.pathname, text });
  }, []);

  const currentRow = useCallback((): HTMLElement | null => {
    const id = selectedId.current;
    if (!id) return null;
    const el = selectedEl.current;
    if (el && el.isConnected && el.getAttribute("data-task-id") === id) return el;
    return rows().find((r) => r.getAttribute("data-task-id") === id) ?? null;
  }, []);

  const select = useCallback(
    (el: HTMLElement | null, as: Mode = "true") => {
      clearMarks();
      selectedEl.current = el;
      if (!el) {
        selectedId.current = null;
        setAnnouncement("");
        return;
      }
      mode.current = as;
      el.setAttribute(SELECTED, as);
      selectedId.current = el.getAttribute("data-task-id");
      if (as === "hover") {
        setAnnouncement("");
        return;
      }
      el.scrollIntoView?.({ block: "nearest" });
      const title = latest.current.api.tasks.find((t) => t.id === selectedId.current)?.title;
      setAnnouncement(title ?? "");
    },
    [setAnnouncement],
  );

  // New page, new list: drop the selection.
  useEffect(() => {
    clearMarks();
    selectedId.current = null;
    selectedEl.current = null;
  }, [pathname]);

  // Rows re-render or vanish when tasks change; keep the mark honest.
  useEffect(() => {
    if (!selectedId.current) return;
    const el = currentRow();
    if (!el) {
      selectedId.current = null;
      selectedEl.current = null;
      setAnnouncement("");
    } else if (!el.hasAttribute(SELECTED)) {
      clearMarks();
      selectedEl.current = el;
      el.setAttribute(SELECTED, mode.current);
    }
  }, [api.tasks, currentRow, setAnnouncement]);

  // The task under the pointer is the target. mousemove, not mouseover, so a
  // list scrolling under a resting pointer never steals a keyboard selection.
  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest<HTMLElement>("[data-task-id]") ?? null;
      if (row) {
        if (row !== selectedEl.current || !row.hasAttribute(SELECTED)) select(row, "hover");
      } else if (selectedId.current && mode.current === "hover") {
        select(null);
      }
    }
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [select]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      const action = matchShortcut(event);
      if (!action) return;

      const { api, router } = latest.current;

      // With the task panel open, Backspace trashes the task it shows. Only
      // when the panel is the one layer up: never under a menu or a confirm.
      if (action === "trash" && api.openTaskId && document.querySelectorAll(BLOCKING).length === 1) {
        event.preventDefault();
        void api.trashTask(api.openTaskId);
        api.closeTask();
        return;
      }

      if (document.querySelector(BLOCKING)) return;

      const focused = document.activeElement;
      const idle = focused === null || focused === document.body;
      if ((action === "open" || action === "done") && event.key !== "x" && event.key !== "e" && !idle) {
        return;
      }
      if (event.key.startsWith("Arrow") && focused?.closest(ARROW_WIDGETS)) return;

      if (action === "sheet") {
        event.preventDefault();
        setSheetOpen(true);
        return;
      }

      if (action === "quickAdd") {
        event.preventDefault();
        if (document.getElementById("doem-quick-add")) focusWhenReady("doem-quick-add");
        else if (document.getElementById("doem-inbox-quick-add")) focusWhenReady("doem-inbox-quick-add");
        else {
          router.push("/");
          focusWhenReady("doem-quick-add");
        }
        return;
      }

      const all = rows();
      const current = currentRow();
      if (!current) {
        selectedId.current = null;
        selectedEl.current = null;
      }

      if (action === "clear") {
        // Left alone when nothing is selected, so Escape keeps its other jobs.
        if (!current) return;
        event.preventDefault();
        select(null);
        return;
      }

      if (action === "next" || action === "prev") {
        if (all.length === 0) return;
        event.preventDefault();
        const index = current ? all.indexOf(current) : -1;
        let target: HTMLElement;
        if (index === -1) target = action === "next" ? all[0] : all[all.length - 1];
        else target = all[Math.min(all.length - 1, Math.max(0, index + (action === "next" ? 1 : -1)))];
        select(target);
        return;
      }

      const id = selectedId.current;
      if (!id || !current) return;
      const task = api.tasks.find((t) => t.id === id);
      if (!task) return;
      event.preventDefault();
      const todayISO = toISODate(new Date());

      switch (action) {
        case "done":
          void (task.status === "done" ? api.reopenTask(id) : api.completeTask(id));
          break;
        case "today":
          if (task.scheduled !== todayISO) void api.rescheduleTasks([id], todayISO);
          break;
        case "tomorrow":
          void api.rescheduleTasks([id], addDays(todayISO, 1));
          break;
        case "priority":
        case "noPriority": {
          const priority = Number(event.key) as Priority;
          if (task.priority !== priority) void api.patchTask(id, { priority });
          break;
        }
        case "pickDate": {
          const trigger = current.querySelector<HTMLElement>('[aria-label="Not today"]');
          if (trigger) trigger.click();
          else api.openTask(id);
          break;
        }
        case "timer":
          void (api.running?.taskId === id ? api.stopTimer() : api.startTimer(id));
          break;
        case "focus":
          if (api.focus?.taskId === id || task.status === "done") break;
          void api.startFocus(task);
          break;
        case "commit": {
          const star = Array.from(current.querySelectorAll<HTMLElement>("button[aria-label]")).find((b) => {
            const label = b.getAttribute("aria-label") ?? "";
            return label.startsWith("Add to Today's") || label.startsWith("Remove from Today's");
          });
          if (star) star.click();
          else {
            void api.commitTask(id, todayISO).then((r) => {
              if (r && r.ok === false) api.openTask(id);
            });
          }
          break;
        }
        case "open":
          api.openTask(id);
          break;
        case "trash": {
          const index = all.indexOf(current);
          const neighbour = all[index + 1] ?? all[index - 1] ?? null;
          void api.trashTask(id);
          // Under the pointer, the next row slides up into place and the next
          // pointer move picks it; jumping the mark would only mislead.
          if (mode.current === "hover") select(null);
          else select(neighbour);
          break;
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [select, currentRow]);

  return (
    <>
      <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <div className="sr-only" aria-live="polite">
        {announced.path === pathname ? announced.text : ""}
      </div>
    </>
  );
}
