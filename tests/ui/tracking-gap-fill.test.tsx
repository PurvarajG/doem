// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GapFillForm, { resolveCut } from "@/components/tracking/GapFillForm";
import type { Gap, PresenceSpan } from "@/lib/types";
import { emptyWorkspace, makeCategory, renderWorkspace, type MockFetch } from "./harness";

const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString();

const GAP: Gap = { startedAt: at(2026, 11, 16, 23, 40), endedAt: at(2026, 11, 17, 8, 15), minutes: 515 };
const DAY = "2026-11-17";

const categories = [
  makeCategory({ id: "cat-sleep", name: "Sleep" }),
  makeCategory({ id: "cat-commute", name: "Commute" }),
];

const rect = (r: Partial<DOMRect>): DOMRect =>
  ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {}, ...r }) as DOMRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
    if (this.hasAttribute("data-picker-menu")) return rect({ height: 120, width: 180 });
    return rect({ top: 100, bottom: 136, left: 20, right: 100, width: 80, height: 36 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { doem?: unknown }).doem;
});

async function setup(spans?: PresenceSpan[]) {
  if (spans) {
    (window as unknown as { doem: { getPresence: () => Promise<PresenceSpan[]> } }).doem = {
      getPresence: vi.fn(async () => spans),
    };
  }
  const onFilled = vi.fn();
  const view = renderWorkspace(<GapFillForm gap={GAP} dayISO={DAY} onFilled={onFilled} />, emptyWorkspace({ categories }));
  await screen.findByLabelText("What did you do from 23:40 to 08:15");
  return { ...view, onFilled };
}

const fills = (mock: MockFetch) => mock.calls.filter((c) => c.url === "/api/segments/fill" && c.method === "POST");

function addCut(hhmm: string) {
  fireEvent.change(screen.getByLabelText("Cut at"), { target: { value: hhmm } });
  fireEvent.click(screen.getByRole("button", { name: "Add a cut" }));
}

async function pickCategory(label: string, name: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const list = await screen.findByRole("listbox", { name: label });
  fireEvent.click(within(list).getByRole("option", { name }));
}

describe("GapFillForm", () => {
  it("opens with no category chosen and Save disabled", async () => {
    await setup();
    expect(screen.getByRole("combobox", { name: "Category, 23:40 to 08:15" }).textContent).toContain("Pick a category");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers lock and wake hints that change nothing until tapped", async () => {
    await setup([{ from: at(2026, 11, 16, 23, 52, 10), to: at(2026, 11, 17, 7, 28, 40), kind: "lock" }]);
    const group = await screen.findByRole("group", { name: "Seen by Doem" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Mac locked 23:52",
      "Usual wake 07:00",
      "Mac unlocked 07:28",
    ]);
    expect(screen.getAllByPlaceholderText("What did you do?")).toHaveLength(1);

    fireEvent.click(within(group).getByRole("button", { name: "Mac unlocked 07:28" }));
    expect(screen.getByLabelText("What did you do from 23:40 to 07:28")).toBeTruthy();
    expect(screen.getByLabelText("What did you do from 07:28 to 08:15")).toBeTruthy();
  });

  it("saves one entry per part at the user's cut, and leaves an unfilled part as a gap", async () => {
    const { mock, onFilled } = await setup();
    addCut("07:30");
    fireEvent.change(screen.getByLabelText("What did you do from 23:40 to 07:30"), { target: { value: "  Slept  " } });
    await pickCategory("Category, 23:40 to 07:30", "Sleep");
    await pickCategory("Category, 07:30 to 08:15", "Commute");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onFilled).toHaveBeenCalled());
    expect(fills(mock).map((c) => c.body)).toEqual([
      { startedAt: at(2026, 11, 16, 23, 40), endedAt: at(2026, 11, 17, 7, 30), categoryId: "cat-sleep", note: "Slept" },
      { startedAt: at(2026, 11, 17, 7, 30), endedAt: at(2026, 11, 17, 8, 15), categoryId: "cat-commute" },
    ]);
  });

  it("fills only the parts that have a category or task", async () => {
    const { mock, onFilled } = await setup();
    addCut("07:30");
    await pickCategory("Category, 23:40 to 07:30", "Sleep");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onFilled).toHaveBeenCalled());
    expect(fills(mock)).toHaveLength(1);
    expect(fills(mock)[0].body).toMatchObject({ endedAt: at(2026, 11, 17, 7, 30) });
  });

  it("refuses a time outside the gap and ignores one on its edge", async () => {
    await setup();
    addCut("09:00");
    expect(screen.getByRole("alert").textContent).toBe("That time is outside this gap.");
    addCut("08:15");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove cut/ })).toBeNull();
  });

  it("removing a cut merges the parts and keeps the earlier part's values", async () => {
    await setup();
    addCut("07:30");
    fireEvent.change(screen.getByLabelText("What did you do from 23:40 to 07:30"), { target: { value: "Slept" } });
    fireEvent.change(screen.getByLabelText("What did you do from 07:30 to 08:15"), { target: { value: "Walked" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove cut at 07:30" }));
    expect((screen.getByLabelText("What did you do from 23:40 to 08:15") as HTMLInputElement).value).toBe("Slept");
    expect(screen.getAllByPlaceholderText("What did you do?")).toHaveLength(1);
  });

  it("stays open when a save fails", async () => {
    const { mock, onFilled } = await setup();
    await pickCategory("Category, 23:40 to 08:15", "Sleep");
    mock.failNext("/api/segments/fill");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fills(mock)).toHaveLength(1));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
    expect(onFilled).not.toHaveBeenCalled();
  });

  it("shows no hint row in the web build", async () => {
    await setup();
    expect(screen.queryByRole("group", { name: "Seen by Doem" })).toBeNull();
  });
});

describe("resolveCut", () => {
  const start = new Date(2026, 10, 16, 23, 40).getTime();
  const end = new Date(2026, 10, 17, 8, 15).getTime();
  it("finds the first occurrence inside a gap that crosses midnight", () => {
    expect(resolveCut("23:50", start, end)).toBe(new Date(2026, 10, 16, 23, 50).getTime());
    expect(resolveCut("07:30", start, end)).toBe(new Date(2026, 10, 17, 7, 30).getTime());
    expect(resolveCut("09:00", start, end)).toBeNull();
    expect(resolveCut("", start, end)).toBeNull();
  });
});
