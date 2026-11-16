import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Tour from "@/components/Tour";
import { TOUR, startTour } from "@/lib/tour";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

type Store = {
  projects: { id: string; name: string; archived: boolean }[];
  tasks: { id: string; committedOn?: string }[];
  running: { taskId: string } | null;
};
let store: Store;
vi.mock("@/lib/store-context", () => ({ useTasks: () => store }));

/** A real element for a step to light up, with a box jsdom would otherwise report as empty. */
function anchor(attr: string, value: string) {
  const el = document.createElement("div");
  el.setAttribute(attr, value);
  el.getBoundingClientRect = () => ({ top: 100, left: 300, width: 400, height: 40, right: 700, bottom: 140, x: 300, y: 100, toJSON: () => ({}) });
  el.scrollIntoView = () => {};
  document.body.append(el);
  return el;
}

beforeEach(() => {
  push.mockClear();
  pathname = "/";
  window.history.pushState({}, "", "/");
  store = { projects: [{ id: "p1", name: "Launch", archived: false }], tasks: [{ id: "a" }], running: null };
});

afterEach(() => {
  document.querySelectorAll("[data-tour]").forEach((el) => el.remove());
});

async function open() {
  const user = userEvent.setup();
  const view = render(<Tour />);
  act(() => startTour());
  await screen.findByRole("region", { name: "Welcome to Doem" });
  return { user, ...view };
}

describe("Tour", () => {
  test("stays closed until started, then opens on the welcome card", async () => {
    render(<Tour />);
    expect(screen.queryByRole("region")).toBeNull();
    act(() => startTour());
    expect(await screen.findByRole("region", { name: "Welcome to Doem" })).toBeInTheDocument();
    expect(screen.getByText(`1 of ${TOUR.length}`)).toBeInTheDocument();
    // The app turns task shortcuts off under any dialog; the tour must not be one.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("skips the project steps when there is no project", async () => {
    store.projects = [{ id: "old", name: "Old", archived: true }];
    await open();
    expect(screen.getByText(`1 of ${TOUR.length - 2}`)).toBeInTheDocument();
  });

  test("Start opens the Inbox and lights up quick add", async () => {
    const { user } = await open();
    anchor("data-tour", "inbox-add");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(push).toHaveBeenCalledWith("/inbox");
    pathname = "/inbox";
    window.history.pushState({}, "", "/inbox");
    expect(await screen.findByRole("region", { name: "Catch it in the Inbox" })).toBeInTheDocument();
    expect(screen.getByText(/Try it: Add something on your mind/)).toBeInTheDocument();
  });

  test("doing the Try it moves the tour on by itself", async () => {
    pathname = "/inbox";
    window.history.pushState({}, "", "/inbox");
    anchor("data-tour", "inbox-add");
    anchor("aria-labelledby", "inbox-brain-dump-title");
    const { user, rerender } = await open();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("region", { name: "Catch it in the Inbox" });
    store = { ...store, tasks: [...store.tasks, { id: "b" }] };
    rerender(<Tour />);
    expect(screen.getByText("Done. On to the next step.")).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Empty your head at once" }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  test("Back returns to the previous step", async () => {
    pathname = "/inbox";
    window.history.pushState({}, "", "/inbox");
    anchor("data-tour", "inbox-add");
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("region", { name: "Welcome to Doem" })).toBeInTheDocument();
  });

  test("End tour and Escape close it", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "End tour" }));
    expect(screen.queryByRole("region")).toBeNull();
    act(() => startTour());
    await screen.findByRole("region", { name: "Welcome to Doem" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region")).toBeNull();
  });

  test("can start at a step, and Finish on the last one closes it", async () => {
    const user = userEvent.setup();
    render(<Tour />);
    act(() => startTour("done"));
    await screen.findByRole("region", { name: "That's the loop" });
    expect(screen.queryByRole("button", { name: "End tour" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.queryByRole("region")).toBeNull();
  });
});
