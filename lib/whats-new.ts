import type { IconName } from "@/components/ui/Icon";

/** Bump when the list below changes, so the sheet opens once more for everyone. */
export const WHATS_NEW_VERSION = "p0-projects-tasks";
export const WHATS_NEW_SEEN_KEY = "doem.whatsNewSeen";
/** Dispatched on window to open the sheet from anywhere (the profile menu). */
export const WHATS_NEW_OPEN_EVENT = "doem:whats-new";

/** Where "Show me" goes. `project` means the first active project's board. */
export type WhatsNewTarget = "project" | "inbox" | "upcoming" | "archived";

export type WhatsNewItem = {
  icon: IconName;
  title: string;
  body: string;
  target?: WhatsNewTarget;
};

export const WHATS_NEW: { title: string; items: WhatsNewItem[] }[] = [
  {
    title: "Boards",
    items: [
      {
        icon: "board",
        title: "Manage lanes in Project settings",
        body: "Rename, reorder, limit, retype or remove a lane. New lanes land before Done.",
        target: "project",
      },
      {
        icon: "target",
        title: "Cards land where you drop them",
        body: "Moving a card down its lane, or after trashing one, no longer lands a slot off.",
        target: "project",
      },
      {
        icon: "repeat",
        title: "Repeating tasks repeat however you finish them",
        body: "Dragging to Done or changing the lane creates the next one. Reopening takes it back if you haven't started it.",
      },
      {
        icon: "trash",
        title: "Restore brings a task back as it was",
        body: "A finished task you trash and restore comes back finished, in Done.",
      },
    ],
  },
  {
    title: "Planning",
    items: [
      {
        icon: "plus",
        title: "Lane tasks start without a date",
        body: "Adding to a lane no longer puts the task on Today. Type a day, like tomorrow, to date it.",
        target: "project",
      },
      {
        icon: "inbox",
        title: "Inbox is for unsorted tasks",
        body: "A project task with no date is backlog now, not Inbox.",
        target: "inbox",
      },
      {
        icon: "cal",
        title: "Multi-day tasks show on every day",
        body: "Next 7 days lists them on each day they span, and counts them once.",
        target: "upcoming",
      },
      {
        icon: "repeat",
        title: "Repeat keeps your interval",
        body: "Switching every 2 weeks to monthly keeps every 2.",
      },
    ],
  },
  {
    title: "Projects",
    items: [
      {
        icon: "folder",
        title: "Archived projects have a home",
        body: "Settings lists them with Un-archive. #name in quick add skips them.",
        target: "archived",
      },
      {
        icon: "x",
        title: "Delete says what happens",
        body: "The sidebar now shows how many tasks lose their project, same as Settings.",
      },
    ],
  },
];

export function hasSeenWhatsNew(): boolean {
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY) === WHATS_NEW_VERSION;
  } catch {
    // Storage unavailable: treat as seen so the sheet never nags on every load.
    return true;
  }
}

export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW_VERSION);
  } catch {
    // Not remembered; harmless.
  }
}

export function openWhatsNew(): void {
  window.dispatchEvent(new Event(WHATS_NEW_OPEN_EVENT));
}
