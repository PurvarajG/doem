import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceSection from "@/components/settings/AppearanceSection";

vi.mock("@/components/settings/SettingRow", () => ({
  default: ({ label, control }: { label: React.ReactNode; control: React.ReactNode }) => (
    <li>
      <span>{label}</span>
      {control}
    </li>
  ),
}));

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.density;
});

const theme = () => within(screen.getByRole("radiogroup", { name: "Theme" }));
const size = () => within(screen.getByRole("radiogroup", { name: "Interface size" }));

describe("AppearanceSection", () => {
  it("shows a Theme row with Auto selected by default", () => {
    render(<AppearanceSection />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(theme().getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("choosing Dark saves the theme and sets data-theme", () => {
    render(<AppearanceSection />);
    fireEvent.click(theme().getByRole("radio", { name: "Dark" }));
    expect(store.get("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme().getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("choosing Auto again clears data-theme", () => {
    render(<AppearanceSection />);
    fireEvent.click(theme().getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(theme().getByRole("radio", { name: "Auto" }));
    expect(store.get("theme")).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("shows an Interface size row with Auto selected by default", () => {
    render(<AppearanceSection />);
    expect(screen.getByText("Interface size")).toBeInTheDocument();
    expect(size().getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  });

  it("choosing Compact or Comfortable saves it and sets data-density", () => {
    render(<AppearanceSection />);
    fireEvent.click(size().getByRole("radio", { name: "Compact" }));
    expect(store.get("density")).toBe("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    fireEvent.click(size().getByRole("radio", { name: "Comfortable" }));
    expect(store.get("density")).toBe("comfortable");
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });
});
