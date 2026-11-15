"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Interface density: how big the parts are. Compact is Mac scale, Comfortable
 * is the mockup scale; Auto picks by the screen the window is on. The CSS is
 * the `:root[data-density="compact"]` block in globals.css.
 *
 * Auto keys on the SCREEN, not the window: resizing a window should show more
 * or less, never rescale the parts. Laptop screens and 1080p displays (under
 * 1200pt tall) get Compact; larger displays get Comfortable.
 *
 * The saved choice lives in localStorage, like the theme, so DENSITY_INIT in
 * app/layout.tsx can apply it before first paint.
 */
export type Density = "auto" | "compact" | "comfortable";
export type ResolvedDensity = Exclude<Density, "auto">;

const KEY = "density";
export const AUTO_COMPACT_BELOW = 1200;

/** Keep in step with DENSITY_INIT in app/layout.tsx. */
export function resolveDensity(choice: Density, screenHeight: number): ResolvedDensity {
  if (choice !== "auto") return choice;
  return screenHeight < AUTO_COMPACT_BELOW ? "compact" : "comfortable";
}

function read(): Density {
  try {
    const v = localStorage.getItem(KEY);
    return v === "compact" || v === "comfortable" ? v : "auto";
  } catch {
    return "auto";
  }
}

const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function write(next: Density) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: the choice still applies for this session.
  }
  for (const notify of listeners) notify();
}

function apply(choice: Density) {
  const root = document.documentElement;
  // The capture window is a fixed 560x64 native window sized to the
  // comfortable composer; it never takes a density.
  if (window.location.pathname === "/capture") delete root.dataset.density;
  else root.dataset.density = resolveDensity(choice, window.screen.height);
}

/**
 * Reads the saved density and keeps <html data-density> current. Under Auto
 * it re-resolves when the window lands on another screen; Chromium updates
 * `screen` and fires `resize` when a window changes displays.
 */
export function useDensity(): [Density, (next: Density) => void] {
  const choice = useSyncExternalStore(subscribe, read, () => "auto" as Density);

  useEffect(() => {
    apply(choice);
    if (choice !== "auto") return;
    const onResize = () => apply("auto");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [choice]);

  return [choice, write];
}
