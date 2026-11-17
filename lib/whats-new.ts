import type { IconName } from "@/components/ui/Icon";

/** Bump when the list below changes, so the sheet opens once more for everyone. */
export const WHATS_NEW_VERSION = "1.1.0";
export const WHATS_NEW_SEEN_KEY = "doem.whatsNewSeen";
/** Dispatched on window to open the sheet from anywhere (the profile menu). */
export const WHATS_NEW_OPEN_EVENT = "doem:whats-new";

/** Where "Show me" goes. `project` means the first active project's board. */
export type WhatsNewTarget = "project" | "inbox" | "upcoming" | "archived" | "tracking";

export type WhatsNewItem = {
  icon: IconName;
  title: string;
  body: string;
  target?: WhatsNewTarget;
};

export const WHATS_NEW: { title: string; items: WhatsNewItem[] }[] = [
  {
    title: "Tracking",
    items: [
      {
        icon: "clock",
        title: "Fill a gap the way it happened",
        body: "Type a time to cut a gap into parts, then say what you did in each. Nothing is picked for you, and parts you leave empty stay as gaps.",
        target: "tracking",
      },
      {
        icon: "monitor",
        title: "Doem remembers when your Mac slept",
        body: "Lock and sleep times show as hints when you fill a gap, such as Mac locked 23:52. Tap one to cut there; ignore it and nothing changes.",
        target: "tracking",
      },
      {
        icon: "moon",
        title: "Last night is one gap",
        body: "The morning's first gap now starts where last night's last entry ended, not at a fixed hour.",
        target: "tracking",
      },
      {
        icon: "list",
        title: "Entries show what you did",
        body: "An entry without a task is named by its description, with its category as a coloured dot.",
        target: "tracking",
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
