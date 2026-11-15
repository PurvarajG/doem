// Compiles native/doem-calendar.swift into build/doem-calendar, the small
// helper that reads the Mac's Calendar store for the Calendar page.
//
// Skipped, not failed, off macOS or without the Swift compiler: the app then
// falls back to the iCloud connection, exactly as before this helper existed.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "native", "doem-calendar.swift");
const output = path.join(root, "build", "doem-calendar");

if (process.platform !== "darwin") {
  console.log("calendar helper: skipped (not macOS)");
  process.exit(0);
}

try {
  execFileSync("xcrun", ["--find", "swiftc"], { stdio: "ignore" });
} catch {
  console.log("calendar helper: skipped (no Swift compiler; install the Xcode command line tools)");
  process.exit(0);
}

mkdirSync(path.dirname(output), { recursive: true });
execFileSync(
  "xcrun",
  ["swiftc", "-O", "-swift-version", "5", "-target", "arm64-apple-macos12.0", source, "-o", output],
  { stdio: "inherit" },
);
console.log(`calendar helper: built ${path.relative(root, output)}`);
