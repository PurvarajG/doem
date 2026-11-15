// Reads events from the Mac's Calendar store (EventKit), so Doem shows every
// account added to Calendar: iCloud, Google, Exchange, subscriptions.
//
// Read-only. It never writes to the store. Built by scripts/build-calendar-helper.mjs
// into build/doem-calendar and run by lib/mac-calendar.ts.
//
//   doem-calendar status                       -> {"status": "..."}
//   doem-calendar events 2026-11-01 2026-11-30 -> {"status": "...", "events": [...]}
//
// `status` never prompts. `events` asks macOS for Calendar access the first
// time. The prompt is shown for the app that launched this helper (Doem),
// which is why Doem's Info.plist carries NSCalendarsFullAccessUsageDescription.

import EventKit
import Foundation

/// Tasks from Doem's own feed, when the user subscribed to it in Calendar.
/// Showing them again as outside events would double every task. The suffix is
/// the feed's UID contract, see lib/ics.ts.
let ownFeedUidSuffix = "@dayplan"

func emit(_ object: [String: Any]) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [])
  FileHandle.standardOutput.write(data)
  exit(0)
}

func statusName() -> String {
  let status = EKEventStore.authorizationStatus(for: .event)
  if #available(macOS 14.0, *) {
    switch status {
    case .fullAccess: return "granted"
    case .notDetermined: return "undetermined"
    default: return "denied" // denied, restricted, writeOnly: nothing to read
    }
  }
  switch status {
  case .authorized: return "granted"
  case .notDetermined: return "undetermined"
  default: return "denied"
  }
}

func requestAccess(_ store: EKEventStore) {
  let done = DispatchSemaphore(value: 0)
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { _, _ in done.signal() }
  } else {
    store.requestAccess(to: .event) { _, _ in done.signal() }
  }
  done.wait()
}

let args = CommandLine.arguments
guard args.count >= 2 else { emit(["status": statusName()]) }

if args[1] == "status" { emit(["status": statusName()]) }

guard args[1] == "events", args.count == 4 else {
  FileHandle.standardError.write("usage: doem-calendar status | events <start> <end>\n".data(using: .utf8)!)
  exit(2)
}

let calendar = Calendar.current
let dayFormat = DateFormatter()
dayFormat.calendar = Calendar(identifier: .gregorian)
dayFormat.locale = Locale(identifier: "en_US_POSIX")
dayFormat.timeZone = calendar.timeZone
dayFormat.dateFormat = "yyyy-MM-dd"

let instantFormat = ISO8601DateFormatter()
instantFormat.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
instantFormat.timeZone = TimeZone(identifier: "UTC")

guard let from = dayFormat.date(from: args[2]), let lastDay = dayFormat.date(from: args[3]),
  let to = calendar.date(byAdding: .day, value: 1, to: lastDay)
else {
  FileHandle.standardError.write("dates must be YYYY-MM-DD\n".data(using: .utf8)!)
  exit(2)
}

let store = EKEventStore()
if statusName() == "undetermined" { requestAccess(store) }
guard statusName() == "granted" else { emit(["status": statusName(), "events": []]) }

// EventKit expands repeating events itself, so each occurrence arrives as its
// own event. The range is local days: the grid asking is on this same Mac.
let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
var events: [[String: Any]] = []

for event in store.events(matching: predicate) {
  if let uid = event.calendarItemExternalIdentifier, uid.hasSuffix(ownFeedUidSuffix) { continue }
  guard let start = event.startDate, let end = event.endDate else { continue }

  let title = (event.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  var item: [String: Any] = [
    "id": "\(event.calendarItemIdentifier)::\(Int(start.timeIntervalSince1970))",
    "title": title.isEmpty ? "(No title)" : title,
    "allDay": event.isAllDay,
  ]
  if event.isAllDay {
    // Doem wants an exclusive end day, as iCalendar has it. EventKit ends an
    // all-day event at 23:59:59 on its last day (some sources: midnight after).
    let lastInstant = max(start, end.addingTimeInterval(-1))
    let exclusive = calendar.date(byAdding: .day, value: 1, to: lastInstant) ?? lastInstant
    item["start"] = dayFormat.string(from: start)
    item["end"] = dayFormat.string(from: exclusive)
  } else {
    item["start"] = instantFormat.string(from: start)
    item["end"] = instantFormat.string(from: end)
  }
  events.append(item)
}

emit(["status": "granted", "events": events])
