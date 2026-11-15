import type { MacCalendarStatus } from "@/lib/mac-calendar";

/**
 * Where the Calendar page's outside events come from. The Mac's own Calendar
 * is tried first; the iCloud connection is the fallback (lib/external-events.ts),
 * so its setup steps only show when the Mac's Calendar isn't the source.
 */
export default function ICloudStatus({
  configured,
  mac = "unavailable",
}: {
  configured: boolean;
  mac?: MacCalendarStatus;
}) {
  return (
    <div className="px-3 pb-3">
      <p className="pb-1 pt-4 text-meta text-ink-3">Show your calendar events</p>
      {mac === "granted" && (
        <p className="mt-2 text-secondary text-ink-3">
          <span className="text-ink">Connected to Calendar on this Mac.</span> Events from every
          account you have in the Calendar app appear on the Calendar page, read-only. Nothing is
          ever written back.
        </p>
      )}
      {mac === "undetermined" && (
        <p className="mt-2 text-secondary text-ink-3">
          <span className="text-ink">Not allowed yet.</span> Open the Calendar page and choose
          Allow Full Access when macOS asks. Doem only reads your events.
        </p>
      )}
      {mac === "denied" && (
        <p className="mt-2 text-secondary text-ink-3">
          <span className="text-ink">Calendar access is off.</span> Turn Doem on in System
          Settings, Privacy &amp; Security, Calendars, set it to Full Access, then reopen Doem.
        </p>
      )}
      {mac !== "granted" &&
        (configured ? (
          <p className="mt-3 text-secondary text-ink-3">
            <span className="text-ink">{mac === "unavailable" ? "Connected." : "Using iCloud for now."}</span>{" "}
            Your iCloud events appear on the Calendar page, read-only. They are fetched fresh every
            few minutes and never written back.
          </p>
        ) : mac === "unavailable" ? (
          <>
            <p className="mt-2 text-secondary text-ink">iCloud events aren&apos;t connected yet.</p>
            <p className="mt-3 text-secondary text-ink-3">
              In the desktop app, open{" "}
              <span className="text-ink">File, Calendar Integration Settings</span> and fill in{" "}
              <code className="font-mono text-meta">icloudAppleId</code> and{" "}
              <code className="font-mono text-meta">icloudAppPassword</code>, then restart Doem.
              Running from source, set <code className="font-mono text-meta">ICLOUD_APPLE_ID</code>{" "}
              and <code className="font-mono text-meta">ICLOUD_APP_PASSWORD</code> instead.
            </p>
            <p className="mt-3 text-secondary text-ink-3">
              The password must be an app-specific password from appleid.apple.com. iCloud CalDAV
              rejects your real Apple ID password once two-factor is on.
            </p>
          </>
        ) : null)}
    </div>
  );
}
