// The in-app walkthrough: steps, and where its card goes. Pure module, no React.
// The tour runs on the real pages and points at real elements, found by the
// `anchor` selector. Keys come from lib/shortcuts.ts, quick-add words from
// parseQuickAdd in lib/parse.ts; keep the copy in step with both.

/** Dispatched on window to start the tour (detail: optional step id). */
export const TOUR_START_EVENT = "doem:tour";

export type TourSide = "top" | "right" | "bottom" | "left";

/**
 * Finishing the step's "Try it" moves the tour on by itself.
 * taskAdded: any new task. committed: a task not committed before now is (a swap counts).
 * timerToggled: the running timer changes: started, stopped or moved to another task.
 */
export type TourGoal = "taskAdded" | "committed" | "timerToggled";

export type TourStep = {
  id: string;
  /** Page to open first. `project` is the first active project; the step is skipped without one. */
  route?: string;
  /** CSS selector; the first match is lit up. No anchor, or none found: the card sits centred. */
  anchor?: string;
  side?: TourSide;
  title: string;
  body: string;
  /** Small legend in the card: each row a label and the keys or words for it. */
  keys?: { label: string; keys: string[]; combo?: boolean }[];
  tryIt?: string;
  goal?: TourGoal;
  /** The lit element can be clicked and typed in. Otherwise the whole page is held still. */
  interactive?: boolean;
};

export const TOUR: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Doem",
    body: "Doem runs on a daily loop: catch everything in the Inbox, give it a day, commit to a few tasks each morning, time the work, and wrap up at night. This tour walks the loop on your real pages. Try each step as you go, or just read.",
  },
  {
    id: "capture",
    route: "/inbox",
    anchor: '[data-tour="inbox-add"]',
    side: "bottom",
    title: "Catch it in the Inbox",
    body: "When something comes up, type it here and press Return. It waits in the Inbox until you give it a day. Details go in the same line, and typing a day skips the Inbox:",
    keys: [
      { label: "Project, tag", keys: ["#name", "@tag"] },
      { label: "Priority, estimate", keys: ["p1", "30m"] },
      { label: "Day, time", keys: ["thu", "3pm"] },
      { label: "Repeat", keys: ["weekly"] },
    ],
    tryIt: "Add something on your mind, like: Call dentist 30m p1",
    goal: "taskAdded",
    interactive: true,
  },
  {
    id: "dump",
    route: "/inbox",
    anchor: '[aria-labelledby="inbox-brain-dump-title"]',
    side: "left",
    title: "Empty your head at once",
    body: "Got a lot? Type or paste it here, one task per line. Each line becomes its own Inbox task, and the same quick-add words work.",
    interactive: true,
  },
  {
    id: "sort",
    route: "/inbox",
    anchor: '[data-tour="inbox-list"]',
    side: "bottom",
    title: "Give each task a day",
    body: "Point at a task and press a key to schedule it, or open it to add a project. Sort the Inbox down to zero every day or two.",
    keys: [
      { label: "Today", keys: ["Y"] },
      { label: "Tomorrow", keys: ["T"] },
      { label: "Pick a day", keys: ["D"] },
    ],
  },
  {
    id: "week",
    route: "/upcoming",
    anchor: '[data-tour="week"]',
    side: "top",
    title: "Plan the week",
    body: "Next 7 days sets each day's planned time against the time you have free. Move work off a full day; Plan it for… suggests tasks that fit a free one. Anything unfinished waits in Carried over.",
  },
  {
    id: "calendar",
    route: "/calendar",
    anchor: '[aria-label="Calendar view"]',
    side: "bottom",
    title: "See it on the calendar",
    body: "Your tasks by day, week or month, next to the events in your Mac's Calendar. Drag a task to another day to move it.",
    keys: [
      { label: "Day, week, month", keys: ["D", "W", "M"] },
      { label: "Back, forward", keys: ["←", "→"] },
    ],
  },
  {
    id: "projects",
    anchor: 'nav[aria-label="Projects"]',
    side: "right",
    title: "Bigger work lives in projects",
    body: "Anything with more than a few steps gets a project. Each one in the sidebar opens as a board. Start one with New project.",
  },
  {
    id: "board",
    route: "project",
    anchor: '[data-tour="board"]',
    side: "top",
    title: "Move cards across lanes",
    body: "Drag a card to the next lane as the work moves along. Dropping it in Done finishes it. Tasks added to a lane wait without a date until you give them one.",
  },
  {
    id: "lanes",
    route: "project",
    anchor: '[data-tour="project-settings"]',
    side: "bottom",
    title: "Shape the board",
    body: "Settings renames, reorders, limits and removes lanes, and archives the project once it's finished.",
  },
  {
    id: "today",
    route: "/",
    anchor: '[data-tour="today-kpis"]',
    side: "bottom",
    title: "Start each day on Today",
    body: "Today pulls in everything due, what carried over, and how much of the day is left. Open it first thing, and switch to Board or Day to see the same tasks by status or by hour.",
  },
  {
    id: "commit",
    route: "/",
    // The first uncommitted task's row. Its target sits under the row's hover
    // actions, so the step teaches the * key, which acts on the row under the pointer.
    anchor: 'li:has(button[aria-label="Add to Today\'s 3"])',
    side: "bottom",
    title: "Commit to a few",
    body: "Pick the tasks you'll finish no matter what. Three by default; when the day is full, Doem asks which one to swap.",
    tryIt: "Point at this task and press * to commit to it.",
    goal: "committed",
    interactive: true,
  },
  {
    id: "timer",
    route: "/",
    anchor: '[data-testid="up-next"]',
    side: "bottom",
    title: "Work with the timer",
    body: "Up next is the task to do now. Start times it; Focus also counts down its estimate. Tracked time feeds Tracking and shows when estimates run over.",
    keys: [{ label: "Timer, focus", keys: ["S", "F"] }],
    tryIt: "Start the timer on the task up next, or stop it if it's running.",
    goal: "timerToggled",
    interactive: true,
  },
  {
    id: "wrap",
    route: "/wrap",
    anchor: '[aria-labelledby="wrap-tomorrow-title"]',
    side: "left",
    title: "Wrap up the day",
    body: "From 5 pm Today offers Wrap up the day. It shows what got done, moves what didn't, and sets up tomorrow, so the next morning starts planned.",
  },
  {
    id: "tracking",
    route: "/tracking",
    anchor: '[data-tour="tracking-kpis"]',
    side: "bottom",
    title: "See where the time went",
    body: "Tracking sets what you planned against what you tracked: daily totals, plan accuracy and the estimates that ran over. Fill time the timer missed from the gaps in the day.",
  },
  {
    id: "search",
    anchor: 'button[aria-label="Search"]',
    side: "bottom",
    title: "Find anything",
    body: "Search tasks and projects, or run a command, from any page.",
    keys: [{ label: "Search and commands", keys: ["⌘", "K"], combo: true }],
  },
  {
    id: "settings",
    anchor: 'button[data-part="me"]',
    side: "right",
    title: "Make it yours",
    body: "Theme, interface size, how many tasks you commit to, wrap-up time and calendars are in Settings, under this menu. So are the shortcuts and this tour.",
  },
  {
    id: "done",
    title: "That's the loop",
    body: "Catch it in the Inbox, plan the week, commit each morning, time the work, wrap up at night. Press ? on any page for every shortcut.",
  },
];

export function startTour(step?: string): void {
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: step }));
}

export type Rect = { top: number; left: number; width: number; height: number };

/** Space kept between the lit element and the card, and around the window edge. */
export const TOUR_GAP = 14;
export const TOUR_EDGE = 16;

/**
 * Where the card goes: on `side` of the target if it fits, else the opposite
 * side, else the other two, else inside the target's bottom corner (for
 * targets as big as the window). Always clamped inside the window.
 */
export function placeCard(
  target: Rect | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
  side: TourSide = "bottom",
): { top: number; left: number } {
  const clampLeft = (x: number) =>
    Math.min(Math.max(x, TOUR_EDGE), view.width - card.width - TOUR_EDGE);
  const clampTop = (y: number) =>
    Math.min(Math.max(y, TOUR_EDGE), view.height - card.height - TOUR_EDGE);

  if (!target) {
    return { top: clampTop((view.height - card.height) / 2), left: clampLeft((view.width - card.width) / 2) };
  }

  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const room: Record<TourSide, boolean> = {
    top: target.top - TOUR_GAP - card.height >= TOUR_EDGE,
    bottom: bottom + TOUR_GAP + card.height <= view.height - TOUR_EDGE,
    left: target.left - TOUR_GAP - card.width >= TOUR_EDGE,
    right: right + TOUR_GAP + card.width <= view.width - TOUR_EDGE,
  };
  const opposite: Record<TourSide, TourSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const order: TourSide[] = [side, opposite[side], ...(["bottom", "right", "left", "top"] as TourSide[])];
  const pick = order.find((s) => room[s]);

  switch (pick) {
    case "top":
      return { top: target.top - TOUR_GAP - card.height, left: clampLeft(target.left) };
    case "bottom":
      return { top: bottom + TOUR_GAP, left: clampLeft(target.left) };
    case "left":
      return { top: clampTop(target.top), left: target.left - TOUR_GAP - card.width };
    case "right":
      return { top: clampTop(target.top), left: right + TOUR_GAP };
    default:
      return {
        top: clampTop(Math.min(bottom, view.height) - card.height - TOUR_GAP),
        left: clampLeft(Math.min(right, view.width) - card.width - TOUR_GAP),
      };
  }
}
