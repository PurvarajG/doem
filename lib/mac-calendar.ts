import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { ExternalEvent } from "./icloud";

/**
 * Read-only bridge to the Mac's own Calendar store, through the small native
 * helper in native/doem-calendar.swift. Unlike the iCloud bridge it sees every
 * account added to Calendar (Google, Exchange, subscriptions), needs no
 * password, and lets macOS expand repeating events.
 *
 * The helper's path arrives in DOEM_CALENDAR_HELPER, set by the desktop app
 * (electron/main.js). Without it (a web deploy, a test run, a build with no
 * Swift compiler) every function here reports "unavailable" and the caller
 * falls back to iCloud.
 */

export type MacCalendarStatus = "granted" | "undetermined" | "denied" | "unavailable";

type HelperOutput = { status?: string; events?: ExternalEvent[] };

/** Long enough to answer the macOS permission prompt the first time. */
const EVENTS_TIMEOUT_MS = 90_000;
const STATUS_TIMEOUT_MS = 5_000;

function helperPath(): string | null {
  const helper = process.env.DOEM_CALENDAR_HELPER;
  if (!helper || process.platform !== "darwin" || !existsSync(helper)) return null;
  return helper;
}

function run(helper: string, args: string[], timeout: number): Promise<HelperOutput> {
  return new Promise((resolve, reject) => {
    execFile(helper, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      try {
        resolve(JSON.parse(stdout) as HelperOutput);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function toStatus(value: string | undefined): MacCalendarStatus {
  return value === "granted" || value === "undetermined" || value === "denied" ? value : "unavailable";
}

/** Never prompts. Safe to call while rendering Settings. */
export async function getMacCalendarStatus(): Promise<MacCalendarStatus> {
  const helper = helperPath();
  if (!helper) return "unavailable";
  try {
    return toStatus((await run(helper, ["status"], STATUS_TIMEOUT_MS)).status);
  } catch {
    return "unavailable";
  }
}

/**
 * The events overlapping `[startISO, endISO]`, or `null` when the Mac Calendar
 * can't be read (no helper, or access not granted), which tells the caller to
 * try its next source. The first call makes macOS ask for Calendar access.
 */
export async function getMacCalendarEvents(
  startISO: string,
  endISO: string,
): Promise<ExternalEvent[] | null> {
  const helper = helperPath();
  if (!helper) return null;
  const output = await run(helper, ["events", startISO, endISO], EVENTS_TIMEOUT_MS);
  if (output.status !== "granted") return null;
  return (output.events ?? []).sort((a, b) => a.start.localeCompare(b.start));
}
