import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import WhatsNew from "@/components/WhatsNew";
import { WHATS_NEW_SEEN_KEY, WHATS_NEW_VERSION, openWhatsNew } from "@/lib/whats-new";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

let ready = true;
vi.mock("@/lib/store-context", () => ({
  useTasks: () => ({
    ready,
    projects: [
      { id: "old", name: "Old", archived: true },
      { id: "p1", name: "Launch", archived: false },
    ],
  }),
}));

let store: Map<string, string>;

beforeEach(() => {
  push.mockClear();
  ready = true;
  store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

describe("WhatsNew", () => {
  test("opens by itself the first time and lists every change", () => {
    render(<WhatsNew />);
    expect(screen.getByRole("dialog", { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText("Sort projects into folders")).toBeInTheDocument();
    expect(screen.getByText("Save your own templates")).toBeInTheDocument();
  });

  test("waits for the store before opening", () => {
    ready = false;
    render(<WhatsNew />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Got it closes it and it stays closed next time", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WhatsNew />);
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.get(WHATS_NEW_SEEN_KEY)).toBe(WHATS_NEW_VERSION);
    unmount();
    render(<WhatsNew />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the profile menu event reopens it after it was seen", () => {
    store.set(WHATS_NEW_SEEN_KEY, WHATS_NEW_VERSION);
    render(<WhatsNew />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openWhatsNew());
    expect(screen.getByRole("dialog", { name: "What's new" })).toBeInTheDocument();
  });

  test("Show me goes to the first active project and closes the sheet", async () => {
    const user = userEvent.setup();
    render(<WhatsNew />);
    await user.click(screen.getByRole("button", { name: "Show me: Edit columns right on the board" }));
    expect(push).toHaveBeenCalledWith("/projects/p1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Take the tour closes the sheet and starts the walkthrough", async () => {
    const user = userEvent.setup();
    const heard = vi.fn();
    window.addEventListener("doem:tour", heard);
    render(<WhatsNew />);
    await user.click(screen.getByRole("button", { name: "Take the tour" }));
    window.removeEventListener("doem:tour", heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.get(WHATS_NEW_SEEN_KEY)).toBe(WHATS_NEW_VERSION);
  });
});
