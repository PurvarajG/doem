import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import GapsToday from "@/components/tracking/modules/UnaccountedModule";
import { useTasks } from "@/lib/store-context";
import type { Activity } from "@/lib/types";
import { emptyWorkspace, makeCategory, renderWorkspace } from "./harness";

const DAY = "2026-03-01";
const at = (h: number, m = 0) => new Date(2026, 2, 1, h, m).toISOString();

const GAPS = [
  { startedAt: at(7), endedAt: at(8), minutes: 60 },
  { startedAt: at(12), endedAt: at(13, 30), minutes: 90 },
  { startedAt: at(21), endedAt: at(23), minutes: 120 },
];

const activity: Activity = {
  id: "act-1",
  categoryId: makeCategory().id,
  name: "Reading",
  isPreset: true,
  pinned: true,
  sortOrder: 0,
  archived: false,
  createdAt: "2026-03-01T09:00:00.000Z",
};

function Loader() {
  const { loadGaps } = useTasks();
  return (
    <>
      <button onClick={() => loadGaps(DAY)}>load gaps</button>
      <GapsToday dayISO={DAY} />
    </>
  );
}

async function setup(gaps = GAPS) {
  const view = renderWorkspace(<Loader />, emptyWorkspace({ activities: [activity] }));
  view.mock.respondWith("/api/segments/gaps", gaps);
  await userEvent.click(screen.getByRole("button", { name: "load gaps" }));
  return view;
}

const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {} };

describe("Gaps today module", () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this.hasAttribute("data-picker-menu")) return { ...rect, height: 120, width: 192 };
      if (this.getAttribute("role") === "combobox") return { ...rect, top: 100, bottom: 132, left: 20, right: 100, width: 80, height: 32 };
      return { ...rect };
    }) as unknown as typeof Element.prototype.getBoundingClientRect;
  });

  test("range uses 'to' and the duration goes through fmt", async () => {
    await setup();
    expect(await screen.findByText("12:00 to 13:30")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    // No gap here began before the day start, so none is labelled Overnight.
    expect(screen.getAllByText("Choose what you were doing")).toHaveLength(3);
  });

  test("a gap that began before the day started is labelled Overnight", async () => {
    const overnight = { startedAt: new Date(2026, 1, 28, 23, 40).toISOString(), endedAt: at(8, 15), minutes: 515 };
    await setup([overnight, GAPS[1]]);
    expect(await screen.findByText("Overnight")).toBeInTheDocument();
    expect(screen.getAllByText("Choose what you were doing")).toHaveLength(1);
  });

  test("a chip fills the gap with its times", async () => {
    const { mock } = await setup();
    await screen.findByText("12:00 to 13:30");
    await userEvent.click(screen.getAllByRole("button", { name: "Reading" })[1]);
    await waitFor(() => expect(mock.calls.some((c) => c.url === "/api/segments/fill")).toBe(true));
    const call = mock.calls.find((c) => c.url === "/api/segments/fill")!;
    expect(call.body).toMatchObject({ startedAt: GAPS[1].startedAt, endedAt: GAPS[1].endedAt, activityId: "act-1" });
  });

  test("Something else opens the form; Save needs a category and passes the description", async () => {
    const { mock } = await setup();
    await screen.findByText("12:00 to 13:30");
    await userEvent.click(screen.getAllByRole("button", { name: "Something else…" })[1]);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("What did you do?"), "Lunch");
    await userEvent.click(screen.getByRole("combobox", { name: "Category, 12:00 to 13:30" }));
    const list = await screen.findByRole("listbox", { name: "Category, 12:00 to 13:30" });
    await userEvent.click(within(list).getAllByRole("option")[0]);
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(mock.calls.some((c) => c.url === "/api/segments/fill")).toBe(true));
    expect(mock.calls.find((c) => c.url === "/api/segments/fill")!.body).toMatchObject({
      startedAt: GAPS[1].startedAt,
      endedAt: GAPS[1].endedAt,
      categoryId: makeCategory().id,
      note: "Lunch",
    });
  });

  test("Cancel closes the form", async () => {
    await setup();
    await screen.findByText("12:00 to 13:30");
    await userEvent.click(screen.getAllByRole("button", { name: "Something else…" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  test("empty state and vocabulary", async () => {
    const { container } = await await setup([]);
    expect(await screen.findByText("No gaps today.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/unaccounted|untracked|[–—·]/i);
  });

  test("rows carry no banned words or dashes", async () => {
    const { container } = await setup();
    await screen.findByText("12:00 to 13:30");
    expect(container.textContent).not.toMatch(/unaccounted|untracked|[–—·]/i);
  });
});
