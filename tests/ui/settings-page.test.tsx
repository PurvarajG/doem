import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DesktopSection from "@/components/settings/DesktopSection";
import { DESKTOP_BUILT, hasDesktopOptions } from "@/lib/desktop-options";
import TrackingSettings from "@/components/tracking/settings/TrackingSettings";
import { emptyWorkspace, renderWorkspace } from "./harness";

describe("TrackingSettings", () => {
  it("shows a placeholder first, then the four blocks", async () => {
    renderWorkspace(<TrackingSettings />, emptyWorkspace());
    for (const name of ["Categories", "Activities", "Gap rules", "Dashboard modules"]) {
      expect(await screen.findByRole("heading", { name, level: 3 })).toBeTruthy();
    }
    expect(screen.queryByTestId("tracking-settings-loading")).toBeNull();
  });
});

describe("SettingsPage", () => {
  it("has a Projects section and a nav entry for it", async () => {
    // The page also mounts AppearanceSection, which reads localStorage.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    // SettingsNav watches the sections with an IntersectionObserver, which jsdom lacks.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { default: SettingsPage } = await import("@/app/settings/page");
    const { container } = renderWorkspace(await SettingsPage(), emptyWorkspace());
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.textContent).toContain("Projects");
    expect(container.querySelector("#projects")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeTruthy();
    expect(await screen.findByText("No archived projects.")).toBeTruthy();
  });
});

describe("DesktopSection", () => {
  it("shows the built options, Claude awareness included", async () => {
    expect(DESKTOP_BUILT).toEqual({
      captureShortcut: true,
      dockBadge: true,
      nudge: true,
      claudeAwareness: true,
    });
    expect(hasDesktopOptions()).toBe(true);
    const { container } = renderWorkspace(<DesktopSection />, emptyWorkspace());
    expect(await screen.findByText("Capture shortcut")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByText("Claude Code awareness", { selector: "span" })).toBeTruthy();
  });
});
