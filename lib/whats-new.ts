import type { IconName } from "@/components/ui/Icon";

/** Bump when the list below changes, so the sheet opens once more for everyone. */
export const WHATS_NEW_VERSION = "1.0.4";
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
    title: "Projects",
    items: [
      {
        icon: "folder",
        title: "Sort projects into folders",
        body: "Click New folder in the sidebar, then drag projects onto it, or pick a folder in Project settings. Click a folder to fold it away.",
      },
    ],
  },
  {
    title: "Boards",
    items: [
      {
        icon: "board",
        title: "Edit columns right on the board",
        body: "Click a column name to rename it. Its menu moves, limits or deletes it. + adds a column: type a name and press Enter.",
        target: "project",
      },
      {
        icon: "list",
        title: "Start a board from a template",
        body: "An empty board offers Standard, Simple, Software, Content and Pipeline. Switching later keeps every task.",
        target: "project",
      },
      {
        icon: "plus",
        title: "Save your own templates",
        body: "Project settings > Board template > Save these columns as a template. It shows up on every new board.",
        target: "project",
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
