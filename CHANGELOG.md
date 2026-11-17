# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-11-17

### Added
- Fill a gap in parts. Type a time to cut a gap, then give each part a description and a category or task. Parts left without one stay as gaps.
- Doem now records when your Mac was locked or asleep, whether or not a timer runs, and keeps the last 14 days on this Mac. When you fill a gap these show as hints (Mac locked, Mac unlocked, Mac asleep, Mac woke) next to your usual wake time. A hint changes nothing until you tap it.
- What's new lists these changes once after the update.

### Changed
- The gap form asks "What did you do?" first and no longer picks a category for you.
- A day's first gap starts where the previous day's last entry ended, so last night is one gap on the morning's page. If the previous day has no entries, it starts at the day start. Gaps are no longer cut at the waking hours, and a past day shows no gap after its last entry.
- Gaps that began the night before are labelled Overnight.
- An entry without a task or activity is named by its description, not its category. Recent entries shows the category as a coloured dot, a task's or activity's note on a second line, and the description first when editing.
- The waking hours in Settings now only set the usual-wake hint, capacity and the calendar.

### Known issues
- Lock and sleep times are only recorded while Doem is running.
- The Day ribbon's own editor still calls the description a note.
- Whether a board's template row was closed is remembered on this Mac only. If Doem's local storage is cleared, the row can show again on boards that are still empty.
- On Today, a task row's hover buttons cover its commit target, so committing with the mouse doesn't work there. Point at the task and press `*`.
- Reopening a repeating task removes its unstarted next one, including any subtasks you added to that next one.
- Un-archiving a project whose name was reused leaves two active projects with the same name.

## [1.0.4] - 2026-11-16

### Added
- Folders for projects. Click New folder in the sidebar, then drag projects onto a folder (or onto the Projects heading to take them out), or pick a folder in Project settings. Click a folder to collapse it; double-click to rename it. Deleting a folder keeps its projects.
- Edit board columns on the board. Click a column name to rename it. Each column's menu moves it left or right, sets a limit, or deletes it. Done, and a board's last open column, can't be deleted.
- Add a column from the board: click +, type a name, and press Enter. The field stays open for the next one. A name like Ideas or To do makes a backlog column, Waiting or On hold makes a blocked one, and anything else a working one.
- Board templates: Standard, Simple, Software, Content and Pipeline. An empty board offers them in a row above the columns, which hides once you pick one or close it. Any board can switch in Project settings > Board template. Switching moves each task to the column with the same name, then the same type; done tasks stay done and no task is completed by a switch.
- Save your own board templates: Project settings > Board template > Save these columns as a template. Saved templates show on every empty board and can be deleted without changing boards made from them.
- What's new lists these changes once after the update.

### Changed
- In Project settings, Board template sits just above Lanes.

### Known issues
- Whether a board's template row was closed is remembered on this Mac only. If Doem's local storage is cleared, the row can show again on boards that are still empty.
- On Today, a task row's hover buttons cover its commit target, so committing with the mouse doesn't work there. Point at the task and press `*`.
- Reopening a repeating task removes its unstarted next one, including any subtasks you added to that next one.
- Un-archiving a project whose name was reused leaves two active projects with the same name.

## [1.0.3] - 2026-11-16

### Added
- An in-app tour of how Doem is meant to be used: catch tasks in the Inbox, give them a day, plan the week, commit on Today, time the work, wrap up, and review in Tracking. It runs on your real pages, lights up each part it explains, and three steps let you try it (add a task, commit to one, start or stop the timer). Start it from What's new or the profile menu (Take the tour).
- What's new opens once after this update with the list of changes below, and again from the profile menu.
- Project settings manages lanes: rename, reorder, limit, retype or remove a lane. New lanes go before Done.
- Settings lists archived projects with Un-archive.
- The README and the release page show the Terminal command for when macOS says the unsigned app is damaged: `xattr -cr "/Applications/Doem.app"`.

### Changed
- Adding a task to a lane no longer schedules it for today. Type a day, like tomorrow, to date it.
- The Inbox holds only unsorted tasks. A project task with no date is that project's backlog.
- Deleting a project from the sidebar says how many tasks lose their project, the same as Settings.
- `#name` in quick add no longer matches archived projects.

### Fixed
- Moving a card down its own lane, or after trashing one, put it a slot off.
- A repeating task finished by dragging it to Done or changing its lane did not create the next one. Reopening a task now takes back its next one if it hasn't been started.
- Restoring a finished task from Trash brought it back open. It comes back finished, in Done.
- Multi-day tasks showed only on their first day in Next 7 days. They show on every day they span and count once.
- Switching a repeat from every 2 weeks to monthly dropped the interval. It keeps every 2.
- Removing a lane left its tasks showing in the old lane until a reload.

### Known issues
- On Today, a task row's hover buttons cover its commit target, so committing with the mouse doesn't work there. Point at the task and press `*`.
- Reopening a repeating task removes its unstarted next one, including any subtasks you added to that next one.
- Un-archiving a project whose name was reused leaves two active projects with the same name.

## [1.0.2] - 2026-11-15

### Added
- Settings › Appearance › Interface size: Auto, Compact or Comfortable. Compact is the size of a native Mac app: smaller controls, rows and spacing, with text one step smaller. Comfortable is the size Doem had before. Auto, the default, uses Compact on laptop screens and 1080p displays and Comfortable on larger displays. It goes by the screen, so resizing the window never changes the size of anything.

### Changed
- In a window under 920px tall (a 13" or 14" MacBook), KPI tiles on Today, Inbox, Tracking and the wrap-up fold to one line each, and the page header takes less room, so the list starts higher.
- On a large display, pages stop growing at 1536px wide and centre.

### Known issues
- In Compact, narrow KPI tiles can cut a label short, for example "Week…". The numbers stay visible.

## [1.0.1] - 2026-11-15

### Added
- Task keys act on the task under the pointer, so hovering a task and pressing Backspace moves it to trash. They work on board cards, kanban cards, Up next, week items, the day panel and calendar chips, not only list rows. Backspace also trashes the task open in the task panel.
- New task keys: the arrow keys (like J and K), Y to move to today, 1, 2 and 3 to set priority, 0 to clear it, Delete to trash, and Esc to clear the selection.
- Calendar keys: the arrow keys page, T jumps to today, and D, W and M switch between day, week and month.
- The Calendar page reads events from the Mac's Calendar app, so every account added there shows up (iCloud, Google, Exchange, subscriptions). It is read-only. macOS asks for Calendar access the first time. Without access, Doem falls back to the iCloud connection as before.

### Known issues
- The app is not signed, so macOS may ask for Calendar access again after an update.

## [1.0.0] - 2026-11-13

### Changed
- The app is now called Doem. It was called Tempo before. The name, lockup, mark and macOS icon are new.
- The v2 redesign: a new shell with a translucent sidebar, a refreshed top bar, and new styling for task rows, panels, cards and pickers in light and dark themes.
- Today is rebuilt around committed tasks, an Up next row, carried-over tasks, a day timeline and a done-today list.
- Calendar, Tracking, Next 7 days, project boards, Settings and the end-of-day wrap-up follow the same design language.

### Added
- A menu bar menu, opened by either click: the running timer with Stop Tracking, today's tracked total, pinned activities, today's tasks and tasks tracked earlier today. Picking one starts timing it without opening the window. The menu bar shows activity timers as well as task timers, and times past an hour as `1:02:34`.
- The quick capture shortcut can be recorded in Settings > Desktop, with a reset to the default.
- A once-a-day check for a newer release. The packaged app sends a GET request to `api.github.com/repos/PurvarajG/doem/releases/latest`. No data about you is sent.
- A README, an MIT licence and a release checklist.

### Fixed
- An activity timer started from the Tracking page now shows in the sidebar card and the top bar on every page, and after a restart.

### Migration
- On first launch, Doem moves data from the Tempo (or earlier DayPlan) data folder into its own folder, including the database, desktop settings, theme choice and sidebar state. If the old app is still running, the move waits until it has quit. Keep your own backup before upgrading if the data matters.

### Known issues
- The app is not signed or notarized. macOS asks for a one-time right-click, Open (or Open Anyway in System Settings, Privacy & Security) on first launch.
- At a window size of 1440 by 900 the sidebar Completed row can sit under the sidebar foot.
- The Up next row can truncate its last meta item.
- Apple Silicon only. There is no Intel build.

## [0.1.3]

### Added
- Focus-first design tokens and shared interface primitives.
- A week-planning grid for Next 7 days, a two-pane Settings layout, and a focus band on project pages.

### Changed
- Calendar and Tracking restyled; page headers unified; the sidebar became an opaque charcoal rail; project colours now come from one palette.

### Fixed
- The focus card no longer glows and the week grid no longer collapses.
- The tracking settings validator no longer truncates collapse keys.

## [0.1.2]

### Added
- Day and week views in the calendar.
- A complete dark mode and an in-app mark and wordmark.

### Changed
- Layout hierarchy refined; the window is reliably draggable.

### Fixed
- Category and task pickers in Tracking are no longer clipped.
- The macOS app bundle is now always sealed when packaged.

## [0.1.1]

### Fixed
- The DMG download opens outside the hosted site.
- Releases are published through the workflow action.

## [0.1.0]

- First release of the Tempo desktop app for Apple Silicon Macs.
