# Hoomanely: frontend handoff

This is a working localhost frontend for Hoomanely's team planning and daily standups. Team data is realistic sample data held in the browser and saved to `localStorage`. The only server code is one route, `/api/assist`, for the optional AI assistant.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Production check: `npm run build && npm start`. Other checks: `npm run lint`, `npm run typecheck`.

**Optional: use Claude for the AI assistant.** Copy `.env.example` to `.env.local`, set `ANTHROPIC_API_KEY`, and restart the server. Without a key, every AI button still works using a simple built-in offline mode, and the panel shows an "Offline" badge.

Requires Node 20.9+ (tested on Node 20.20). On the first build, `next/font` downloads the Inter font, so that build needs network access.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9, Tailwind CSS 4, Radix primitives wrapped in shadcn-style components (`src/components/ui`), Lucide icons, Sonner for toasts, and the Anthropic TypeScript SDK with Zod for the assistant. All versions are pinned exactly in `package.json`.

TypeScript 7 was deliberately avoided: it is the new native compiler, and Next's tooling still expects the 5.x JS API.

## Architecture

```
src/
  app/                    Routes: / (Team Today), /me (My work), /goals (?goal=<id>), layout, brand colour tokens (globals.css)
  app/api/assist/route.ts AI route: GET reports claude/offline; POST tidy | plan | chat (chat streams text)
  lib/
    types.ts              Typed entities: Team, Person, Sprint, Goal, Task, CheckIn, TaskUpdateSnapshot, TaskEvent
    config.ts             DEMO_TODAY, default user, storage keys, schema version, labels
    dates.ts              Timezone-safe "YYYY-MM-DD" maths and formatting
    validation.ts         Title, estimate, date, URL, dependency and reason rules
    seed/sprint-sheet.ts  The team sprint sheet, transcribed as rows (owner, goal, estimate, status, dates)
    mock-data.ts          Builds sample data from the sheet: sprints, goals, tasks, derived check-ins and history
    data/operations.ts    Pure state transitions (create goal/task, edit, status change, links, publish check-in)
    data/selectors.ts     Read models: feed grouping, presets, goal progress, attention list, task history
    data/timeline.ts      Turns a task's status history into dated timeline segments (currently unused; kept for a Feature Board)
    data/storage.ts       localStorage envelope {schemaVersion, savedAt, data} with validation and recovery
    data/store.tsx        React context exposing data and actions (the only caller of operations/storage)
    ui-state.tsx          Filters and which drawer or dialog is open (not persisted)
    theme.tsx             Light/dark state plus a pre-paint init script
    ai/types.ts           Shared assistant request/response shapes and input limits
    ai/claude.ts          Server-only Claude calls (structured outputs for tidy/plan, streaming chat)
    ai/offline.ts         Rule-based fallback for tidy, plan and chat when no key is set
    ai/snapshot.ts        Plain-text snapshot of team data sent with chat questions
    ai/client.ts          Browser client: calls /api/assist, falls back to offline
  components/
    app-shell/            Sidebar (nav, simulated user switcher, reset), header, recovery banner
    team-today/           Filters, day-grouped feed, check-in cards, "Needs attention now" panel
    tasks/                Task drawer, create/edit dialog, status change, links, history views
    checkin/              "My check-in" dialog
    goals/                Goal list, goal detail, create and edit goal dialogs
    me/                   My work page and month calendar (task-timeline.tsx is currently unused)
    ai/                   "Ask AI" panel, plan card, "Tidy with AI" button, "Plan with AI" hint, mode badge
    shared/badges.tsx     Status, estimate, avatar and goal label display
    shared/notes-text.tsx Renders notes with line breaks and clickable links
    (logo)                Sidebar wordmark: public/hoomanely-wordmark.png, trimmed from public/hoomanely-logo.png (design system logo)
    ui/                   Button, inputs, field, dialog, sheet, confirm dialog, popover, checkbox
```

### Key decisions

- **One demo date.** `DEMO_TODAY` (Friday 2026-09-25) in `src/lib/config.ts` drives the date presets, "today", completion dates and how far open tasks' daily check-ins run. The sprint-sheet data has fixed dates, so moving `DEMO_TODAY` far from late September leaves today's feed empty.
- **Snapshots are the source of history.** A check-in stores a `TaskUpdateSnapshot` per task: status, target, estimate, dependency, progress and support needed as recorded that day. Historical cards read only snapshots, never the task's current state. Current task state lives on `Task`. Every change also appends a `TaskEvent` (status, target date, estimate, dependency, details, carry-over, links).
- **One check-in per person per day.** Re-publishing replaces that check-in's updates in place and sets `editedAt`.
- **Check-ins are for today only.** The dialog always targets `DEMO_TODAY`, so nobody can backdate history.
- **"Needs support" and "Blocked" are distinct.** A dependency or support request is shown in peach as "Needs support". "Blocked" is a status, shown in red, and requires a description of the blocker. In the check-in form, a task needing help uses "Depends on" + "What you need from them"; the free-text box only appears as "What's blocking you?" when the status is Blocked.
- **Carry-over keeps task identity.** The same task ID moves to the destination sprint, `carryOver` records from, to, reason and date, and a `carried_over` event is logged.
- **Dropped requires a reason.** Dropped tasks stay on the goal but are excluded from "X of Y tasks complete".
- **Done records a completion date.** Marking a task Done sets `completedDate = DEMO_TODAY`. Leaving Done clears it; the history events keep the record.
- **Estimates are exactly 0.5, 1, 1.5 or 2 days**, enforced in the UI (a dropdown) and in validation and storage checks. Target dates may move freely, and the original target is kept.
- **Searchable goal picker** (`components/tasks/goal-combobox.tsx`). The Goal field in Add task is a type-to-search box that filters on every keystroke.
  - **Ranking:** titles starting with the typed text come first, then titles with a word starting with it, then any other match. Each group is sorted A–Z.
  - **Keyboard:** arrow keys move through the list, Enter picks, Escape closes.
  - **New goal:** the last option is "Create a new goal"; the typed text becomes the new goal's title.
- **Add or edit task form order:** Goal, Task outcome, then Estimated effort and Status side by side (Status only when creating), then Start and Target dates with the automatic sprint shown below them. An "Optional" section follows with Notes, Links and Depends on.
- **Ownership is a UI rule, not security.** Only the simulated current user can edit their own tasks and check-ins. The sidebar user switcher lets you act as any teammate.
- **Storage recovery.** Missing data loads the seed. Unparsable JSON, a different `schemaVersion`, or structural or referential problems load the seed and show a dismissible notice explaining why. "Reset demo data" (with confirmation) clears only the data key. The theme (`hoomanely.theme`) and demo user (`hoomanely.current-user`) are separate keys and are kept.
- **Theme.** Light by default. A saved preference is applied before paint to avoid a flash. Colours come from the Hoomanely brand palette, defined as tokens in `globals.css`:
  - Plasma Haze is the primary and cool neutral.
  - Sensor Reef marks In Progress.
  - Baseline Gold marks Carried Over.
  - Carbon Matrix provides the dark-mode surfaces.
  - The state colours mark Error (Blocked), Success (Done) and Warning (Needs support). Warning text is darkened from `#C25E00` to `#9A4700` in light mode so small text meets 4.5:1 contrast.

  Dark mode uses its own token set, not an inversion.
- **Notes instead of description and definition of done.** Goals have a title, optional notes and an optional target date. Tasks have a title and optional notes. Notes are free text where people paste links; URLs render as clickable links.
- **AI assistant.**
  - **Tidy with AI** (next to the goal and task title) rewrites a rough title and notes into a short, clear entry. It shows a suggestion first, and nothing changes until "Use this".
  - **Plan with AI** (in both create forms) and the **Plan tasks** mode in the chat turn a description of someone's work into a goal (an existing one if it clearly fits) plus tasks of 0.5 to 2 days. The tasks can be edited, then created for the current user in one click.
  - **Ask Raana** (floating button on every page except My work, named after the team's dog; Raana peeks over the button, rises in on load, and on hover or keyboard focus ducks down behind the button and pops back up with a happy face; images `public/raana-peek.png` and `public/raana-happy.png` with backgrounds removed) answers questions about the team from a snapshot of the app's data: what's blocked, who hasn't checked in, standup summaries, goal progress, and what someone is working on.
  - With a key, requests go to Claude Opus 5 (`claude-opus-5`) through the server route, so the key never reaches the browser. Tidy and plan use structured JSON output; chat streams. Every request enables server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a declined request is retried on Anthropic's recommended fallback model.
  - Effort is `low` for tidy and `medium` for plan and chat. Inputs are capped (see `AI_LIMITS`).
  - Without a key, `/api/assist` answers `{offline: true}` and the browser uses `ai/offline.ts`. Offline results are simpler and are labelled "Offline".
- **My work page (`/me`).** One person's own view:
  - **Summary:** open tasks, blocked, past target and due in the next 7 days.
  - **Calendar:** a Monday-to-Sunday month view, with arrows and a month button that names the month being viewed (September 2026, August 2026, …); clicking it returns to the current month. Past days show what the check-in recorded that day (Done, In progress, Blocked). Later days show planned work, and a flag marks a task's target date ("Due"). Arrow keys move between days. The logic is in `lib/data/calendar.ts`.
  - **Day panel:** picking a day lists its tasks and that day's update. Your own tasks have an Edit button there, so tasks are edited from the calendar. A + button next to the day's date opens Add task with that date filled in as the start and target date; the page-level Add task button was removed (the header one stays). The panel's task list scrolls inside the panel, so a busy day never makes the calendar taller.
  - **Removed on request:** the task and goal lists, and the timeline. Goals are edited from the Goals page. `components/me/task-timeline.tsx` and `lib/data/timeline.ts` are kept, but unused.
- **Goals page** (`components/goals/goals-view.tsx`).
  - **Header:** "Goals", a Sprint filter (defaults to the current sprint; "All sprints" is an option; kept in the URL as `?sprint=`), and + New goal on the right.
  - **Which goals a sprint shows:** goals with tasks in that sprint, including tasks carried out of it, plus goals created during the sprint that have no tasks yet (`goalsForSprint`).
  - **Cards:** a grid with a colour tab, done/total for the sprint (with blocked and dropped counts), up to two open tasks, and contributor faces with a "N people" count. Unfinished goals come first.
  - **Right panel:** the sprint's ring of goals completed, its task totals, and the goal list with each goal's creator.
  - **Clicking a card** opens the goal full-width with an "All goals" back link.
  - **On the goal page:** "Sprint N only / All sprints" switches the task scope. Contributor chips (Everyone, Aarthi 3/5, …) show done/total per person; picking one filters the tasks to theirs. Links from elsewhere without `?sprint=` show all sprints.
- **Goal editing.** Only the goal's creator can edit its title, notes and target date, from the goal page. This is a frontend rule, not security. A target date can't be moved into the past, but an existing past target can be kept.
- **Hydration warnings from browser extensions.** Grammarly and similar extensions add attributes to `<body>`. `suppressHydrationWarning` on `<body>` stops those showing as a Next.js dev "Issue"; real mismatches inside the app are still reported.
- **Sprints are fortnights set by the manager.**
  - **The filter:** a Sprint filter sits next to the date and people filters. Picking a sprint shows its check-ins from its start up to today. Upcoming sprints are listed but disabled.
  - **Managing sprints:** only people with `canManageSprints` (Rupam in the sample data) see "Manage sprints". There they can add the next fortnight (dates filled in automatically), adjust dates, or remove future sprints that have no tasks. Overlaps and sprints outside 7 to 28 days are rejected. This is a permission flag, never shown as a title.
  - **Automatic assignment:** check-in cards show their sprint from the check-in date. New tasks take the sprint covering their start date, or the next one if the date falls between sprints. Existing tasks keep their sprint unless carried over.
- **Stand-up summary** (`/standup`, `components/standup/standup-summary.tsx`, logic in `lib/data/standup-notes.ts`). A month calendar marks days that have check-ins; picking a day shows that day's meeting notes as a plain document:
  - **Contents:** Attendees and Absent, a Summary paragraph, Discussion (one line per person), and Action items.
  - **Mentions:** names are highlighted. Task names are clickable.
  - **Copy notes:** copies the notes as plain text.
  - **Edit notes:** anyone can edit the Summary, the Discussion points and the Action items (add, remove, tick done).
    - In the editor, mentions show as readable text. Typing "@Name" highlights a teammate.
    - On save, titles of that day's check-in tasks turn back into links.
    - Edits are stored per date in `AppData.meetingNotes` and replace the generated notes. The footer shows "Edited by …".
    - "Reset to generated notes" removes the edits. Ticking an action item also saves an edit.
  - **`MeetingNotes`:** the shape a recording pipeline should produce. Its text uses `@{personId}` and `#{taskId}` mentions, and `source` is either `"check-ins"` or `"recording"`.
  - **Today's source:** `buildMeetingNotes` writes the notes from check-ins until recordings are connected. They are rebuilt from snapshots, so past notes stay truthful.
- **Sprint report** (`/sprint-report`, `components/sprint-report/`, logic in `lib/data/sprint-report.ts`). **Manager only:** the menu item and the page are shown only to people with `canManageSprints` (Rupam); everyone else sees a short "for managers" message. This is a frontend rule, not security. Opens on the running sprint once it is 3 working days in, otherwise on the last finished one.
  - **Numbers:** Done vs planned, carried over or still open, within estimate, on time, and check-in rate.
  - **Burndown:** estimated days left vs an ideal pace, with hover/keyboard tooltip and a table view.
  - **Goal scorecard:** Done / On track / At risk (blocked or past target) / Partly done / Not finished / Not started. Shows 8 goals, then "Show all".
  - **By team:** per-team bars. The report shows no per-person numbers.
  - **Retro board:** Went well / Didn't go well / Try next. It starts with cards written from the numbers; people add cards, +1 them and remove their own. Cards are stored in `AppData.retroCards`.
  - **Draft sprint email:** written in Rupam's usual format (Summary, Scorecard, Engineering numbers, App growth, Goal detail, Next sprint), signed by the current user. Things the app can't know (release dates, commits, PostHog) are `[CONFIRM]` placeholders.
  - **Definitions:** planned = tasks in the sprint, including ones carried out of it. Done = completed by the sprint's last day. Actual days = working days from start to finish, counting both ends. Within estimate = actual ≤ estimate rounded up.
- **My pace** (My workspace, below the calendar, follows the selected date). Calculated automatically from the day's tasks (the same ones the calendar shows); nothing is entered by hand. Private: shown only on your own workspace.
  - **Weights:** each task counts as estimate × priority weight (P0 4, P1 3, P2 2, P3 1; no priority counts as P0). Percent = done weight ÷ total weight, rounded only for display ("<100%" until truly 100). A day with no tasks has no score.
  - **Done** means done that day: today uses the live status; past days use what that day's check-in recorded.
  - **The walk** (`components/me/walk-scene.tsx`). A hand-drawn stick figure walks a dog through a park: trees, benches, lamp posts, a city skyline with a bridge, and a footpath.
    - **Boards:** each task is a wooden board showing only its priority, in priority order (P0, P0, P1, …). Within a priority, finished tasks come first, in the order they were finished. Clicking a board opens the task.
    - **Walking:** the pair waits before the first unfinished board ("next up" bobs gently) and walks on when it's ticked off. The dog glides along; only its tail wags.
    - **At 100%:** they reach the flag ("Day done!"), the person waves and the dog hops.
    - **Sky:** follows the local clock and is interpolated continuously between colour keyframes. Morning is yellow to pink, day clear blue, evening purple, pink and orange, night deep blue.
      - The sun and moon move on arcs, and the sun warms towards the horizon.
      - Clouds drift and take on the sky's tint. Stars fade in at dusk, the park darkens and the lamps glow.
      - Past days show the evening ("Day's end").
      - "Play the day" runs 05:00 to midnight in 12 s and replays the walk.
    - **Pick them up** (`components/me/walker-pair.tsx`): the walker and the dog are separate draggable characters joined by a stretchy leash (sags when slack, pulls straight when stretched).
      - **Faces:** happy on the ground; scared when lifted high (wide eyes, raised brows, "O" mouth, sweat drop); the dog has its own scared face.
      - **Falling:** letting go in the air drops them with gravity, keeping the throw's speed. A big fall knocks the walker over (dizzy X-eyes) for a moment; then he gets up and walks back to his place.
      - **Physics:** a small rAF loop; reduced motion snaps them straight back.
    - **Narrow screens:** the park scrolls sideways when boards don't fit, following the walker.
    - **Reduced motion:** the pair jumps straight to their spot without walking.
  - **Checklist:** today's tasks can be ticked off (sets Done) or unticked (back to In progress). Past days are read-only. Future days show "Planned". Weekends show "Rest day".
  - **Week:** the average of weekdays so far that had tasks.
  - **Code:** logic in `lib/pace/day-progress.ts` (pure, unit-tested); UI in `components/me/my-pace.tsx`. The earlier finish-plan version and the Raana scene were removed on request.
- **Chart colour:** `--chart-1` (#008b9c light, #22a6b3 dark), checked with the dataviz palette validator for chroma and contrast.
- **Navigation order:** Team Today, Goals, Stand-up summary, Sprint report (managers only), My workspace, Feedback.
- **Demo priorities:** the sprint sheet has no priorities, so the sample data gives each person's tasks that start on the same day a stable mix of P0–P3: always one P0, and a lone task is P0 (`assignDemoPriorities` in `lib/mock-data.ts`).
- **Task priority (P0–P3)**, set in Add task and Edit task. `Task.priority`; helpers `openTasksOnDay`, `priorityChoices` and `comparePriority` in `lib/data/selectors.ts`.
  - **Which levels are offered** depends on your other unfinished tasks on the task's start date.
    - None: no picker, and the task has no priority.
    - Otherwise P0 up to one past the highest level already used, capped at P3. With one other task that's P0/P1; once P0 and P1 are used, P0/P1/P2.
    - When a picker is shown, choosing a level is required.
  - **Saving** sets your other tasks that day that have no priority to P0. The form lists them as "set to P0".
  - **Ordering:** P0 first, then the shorter estimate (no priority counts as P0). This applies to check-in cards on Team Today, the My workspace day panel and calendar cells (chip "P0 …").
  - **Badges** show on cards, the day panel and the task drawer.
  - Changing a priority is recorded in the task history as an edit. "My work" is now called "My workspace".
- **Links on tasks and goals.** Both the task and goal forms have a Links section: "+ Add link", then a name and URL per link.
  - **Validation:** the URL must be http(s). Leave the name empty to use the site's name.
  - **Where they show:** as clickable chips on check-in cards, in the My work day panel, on the goal page and in the task drawer. They open in a new tab.
  - **History:** adding or removing task links from the form is recorded in the task's change log.
  - **Stored data:** links are re-validated when loading saved data, so non-http links are rejected.
  - **Notes:** stay separate and optional.
- **Profile photos.** Click your own avatar (in the sidebar card or at the top of My work) to upload, change or remove your photo.
  - **Processing:** images (PNG, JPG, WebP or GIF, up to 5 MB) are cropped to a square and resized to 256 px in the browser, then stored as a JPEG data URL with the demo data.
  - **Where it shows:** everywhere an avatar appears. People without a photo keep their initials.
  - **Validation:** only bundled `/avatars/…` paths or base64 image data URLs are accepted, both when saving and when loading stored data.
  - **Sample data:** Aarthi uses `public/avatars/aarthi.jpg`.
- **Dev indicator hidden.** `devIndicators: false` in `next.config.ts`, because the dev-mode "N" badge covered the sidebar profile button. Next.js still shows errors.
- **Teams.** People belong to one of seven teams, listed in this order: Hardware, Firmware, Mechanical, AI, Software, Product and Design. The people filter groups people by team, and a team checkbox selects the whole team. Cards show each person's name and team; job titles are intentionally not displayed.

### Replacing the mock layer with a backend

`store.tsx` is the seam. Replace `loadData`/`saveData` with fetches, and route each action (`createTask`, `publishCheckIn`, ...) to an API call. The server should perform the same rules as `operations.ts`: snapshots, events, reasons, and completion dates. Selectors can stay client-side or move server-side. Actions currently return results synchronously; they would become async.

## Sample data

The sample data comes from the team's **sprint sheet** (Aug 28 – Sep 25, including the rows added later), transcribed in `src/lib/seed/sprint-sheet.ts`. `src/lib/mock-data.ts` turns those rows into the app's data.

**Contents**
- 7 teams, 13 people (Tanya, Pranjal and Sanyukta have no rows in the sheet), 7 fortnight sprints, 23 goals and 205 tasks: 171 done, 14 in progress, 19 not started and 1 blocked.
- Today is Fri 25 Sep 2026: 8 of 13 people have checked in.
- Kunal's pet-tag delivery-charge task is blocked on Pranjal, and shows as 18 days past target.

**Taken from the sheet as written:** owner, goal, estimate, status, start and done dates. Titles are lightly cleaned (typos fixed; very long text moved into the task's notes).

**Derived, because the sheet doesn't record it:**
- **Target date:** the start date plus the estimate, in working days. Tasks that took longer than estimated therefore show as finished late. That is inferred from the sheet, not a recorded target.
- **Daily check-ins:** one per person per working day with an active task, using neutral text ("Started.", "In progress.", "Done.", "Still blocked.") plus the sheet's Result/Notes column. Open tasks keep checking in daily up to today.
- **History events:** created, started (or blocked) and done, on those dates.
- **Sprint:** the fortnight containing each task's start date.
- **Dependencies:** the "Support" person becomes a needs-support dependency until the task is done.

**Adjustments to the sheet:**
- **The overlapping sprint:** the sheet's "Sep 21 – Oct 2" overlapped Sep 11 – 24. The fortnights continue instead: Sprint 6 is Sep 25 – Oct 8 and Sprint 7 is Oct 9 – 22. Sprints 1–5 are the sheet's list from Jul 17.
- **Goals:** "Goal" cells that were really task names (many of Pritam's, Aarthi's and Shreya's rows) are grouped under a matching goal, such as New App Revamp or Primary website: SEO, content and conversion. A few closely related goals are merged, e.g. "Ensure reliable EverBowl event capture" into "Make EverBowl reliable".
- **Missing values:** not-started rows are planned from the next working day (Mon 28 Sep). Rows with no dates use their sprint's start; rows with no estimate use 1 day.
- **Duplicates:** the vibration-stability task appeared in two sprints and is kept once.
- **Left out:** the six rows with no owner (five open questions about EverWiz, birthdays, UXCam and follower counts, plus one empty row) and the empty Rupam row. The claude.ai share link in Aarthi's bug-list row, because it carries a private share key.
- **More adjustments:**
  - The duplicated watchdog false-alert task is kept once.
  - Rows with no status are Not Started.
  - Pritam's crop task, done on 26 Sep (after the demo's today), shows as in progress.
  - "Shutdown previous services" is grouped into Infrastructure.
  - New goals from the later rows: PostHog analytics for the revamp app, HCAM2N6 evaluation board bring-up, Release pipeline setup, and Doghouse API migration.
  - Two of Pritam's rows are Not Started in the sheet but noted as not needed; they keep the sheet's status, with the note.
- **Not in the data:** there are no carried-over or dropped tasks, because the sheet has none. Both flows still work and are covered by the tests.

## Checks performed

- `npm run typecheck`, `npm run lint` and `npm run build` all pass with no warnings.
- `SCHEMA_VERSION` is 19 (sample data built from the sprint sheet, including the later rows; profile photos; goal links; stand-up note edits; retro cards; task priority; demo task priorities). Data saved by an earlier build is replaced with fresh sample data, and a notice explains why.
- Screenshots of recent features are in `public/screenshots/` (served at `/screenshots/<name>.png`). Delete the folder before a real deployment.
- `npm test` runs the Vitest unit tests (`src/lib/pace/day-progress.test.ts`, 10 tests): weights, the 75 / 100 / 93.75 / 0% examples, no-task days, priority ordering, display rounding and the weekly average.
- `scripts/e2e.mjs` is a Playwright script run against both the production server and `npm run dev` (Strict Mode): **64 of 64 checks passed with no page errors.** It covers:
  - default Today view and missing check-ins
  - several updates within one card
  - only two quick ranges (Today, Yesterday → today); a custom 6-day range groups newest first, with weekend rows
  - sorting by person within a day
  - historical snapshots (Wednesday shows "Blocked" for a task that is now Done)
  - one person combined with a date range
  - multiple selected people
  - whole-team selection
  - sprint filter (current sprint so far; upcoming sprints disabled), sprint shown on cards, sprint set automatically from a new task's start date
  - only the sprint owner can manage sprints: adding the next fortnight, rejecting overlaps
  - invalid range rejection
  - future and weekend empty states
  - filter reset
  - goal progress excluding dropped tasks
  - goal validation and creation (notes optional, links rendered)
  - "Create and add a task"
  - task validation: title, estimate, dates, dependency
  - task creation
  - URL validation (including `javascript:`) and adding links
  - dependency and target edits recorded in the change log
  - Done (completion date) and Dropped (reason required, completion cleared, history kept)
  - carry-over (sprint and reason, daily history kept)
  - read-only tasks owned by others
  - publishing a check-in as another user (Blocked requires a reason; Needs support rendering)
  - editing the check-in without creating a duplicate
  - Done set via a check-in
  - persistence after refresh
  - theme persistence
  - reset keeping the theme
  - malformed JSON, wrong schema version, and invalid-estimate recovery
  - Escape closing the drawer and returning focus
  - no horizontal overflow at 390px (including My work)
  - My work: summary and calendar only; editing one of your own tasks from the day panel
  - calendar: month navigation, the selected day's tasks (recorded Blocked, planned and Due), and arrow keys moving selection and focus
  - goal editing: the creator can edit and past target dates are rejected; others see no edit button
  - AI in offline mode:
    - `/api/assist` reports offline without a key
    - Tidy rewrites "In the SOS Flow the button is pointing to some other link fixing that" into a "Fix …" title, and only after "Use this"
    - chat answers "What's blocked?" from team data
    - plan mode creates a new goal ("Improve the SOS flow") with 3 tasks
    - Escape closes the panel and returns focus to the launcher
- Screenshots were reviewed in both themes at 1440px desktop, 820px tablet and 390px mobile: Team Today, drawer, check-in dialog, add task, goals, popovers and keyboard focus.

To rerun: `npm i -D playwright-core`, `npm run build && npx next start -p 3100`, then `node scripts/e2e.mjs`. It uses the installed Microsoft Edge; set `BROWSER_CHANNEL=chrome` to use Chrome, or `BASE_URL` to point elsewhere.

## Known limitations

- **Accessibility has not been audited.** The feed was not tested with a screen reader, and contrast was checked by eye, not measured.
- **Date inputs are native**, so their display format follows the browser locale (e.g. dd-mm-yyyy).
- **Clock time comes from the real clock.** Timestamps for new actions use the viewer's current time placed on `DEMO_TODAY`, so a demo run after midnight shows early-morning times.
- **Removing a task from an edited check-in** removes its snapshot for that day, but any status or target change already applied to the task stays, with its history events.
- **No undo** for status changes, and goals can't be archived or deleted yet. Goal edits have no change history, unlike tasks.
- **Filters reset on reload.** They live in memory only and are not reflected in the URL.
- **Feed length.** Very long ranges (up to 62 days) render every card without virtualisation. This is fine for the demo, but would need paging with real data.
- **The e2e script isn't wired into `package.json`**, to keep Playwright out of the app's install.
- **The Claude path has not been run against the live API.** This machine has no API key, so only the offline mode was exercised end to end. The Claude code typechecks against SDK 0.128 and follows the documented patterns, but the first real run should be checked by hand: Tidy, Plan tasks, and a chat question.
- **`/api/assist` has no authentication or rate limiting.** It is fine on localhost, but must be protected before deploying anywhere reachable, or anyone could spend the API key.
- **Claude costs money per request.** Claude Opus 5 is the most capable option; the model is a single constant in `lib/ai/claude.ts` if you want to trade quality for cost.
- **Offline mode is basic.** It uses rules, not AI: good for short, messy titles and step-by-step descriptions, weak on long or unusual phrasing.
- **Chat history isn't saved.** It lives only in the open panel and resets on reload.

## Suggested next steps

1. Review screenshots and tune spacing, colour and density with the team.
2. Put filters in URL query params so standup views can be shared.
3. Allow editing goals, and reassigning a task to another goal (with a history event).
4. Add a "since my last check-in" helper that pre-fills progress with the previous update.
5. Define the API contract from `types.ts` and `operations.ts`, then swap the store's persistence to it.
6. Add unit tests for `operations.ts`, `selectors.ts` and `storage.ts` (e.g. Vitest), and move the e2e script into Playwright Test in CI.
7. Run an accessibility audit (axe plus screen reader passes).
8. Add a key and try the assistant on real standup notes, then tune the prompts in `lib/ai/claude.ts`.

## Sharing the prototype (GitHub Pages) and collecting feedback

- **Feedback page** (`/feedback`, `components/feedback/feedback-page.tsx`):
  - A short nudge, topic chips, a free-text note, an optional "how useful" rating and an optional name. Anonymous unless a name is typed.
  - "Need a spark?" prompts (PR lifecycle, stories → features → release, bugs vs features, stand-ups, planning, this app) add a question to the note.
  - Notes are posted to a Google Apps Script web app that appends a row to a Google Sheet (downloadable as Excel). Setup: `docs/feedback-sheet.md`, script: `docs/feedback-apps-script.gs`.
  - If the URL isn't configured, the page says so and offers "Copy note".
- **Static build:** `npm run build:pages` (`scripts/build-pages.mjs`) sets `STATIC_EXPORT=1` and writes plain files to `out/`.
  - The AI route lives in `src/app/api/assist/route.server.ts`, which only the normal build picks up (`pageExtensions` in `next.config.ts`), so the static site has no server code. The assistant uses its offline helpers there (`IS_STATIC` in `lib/site.ts`).
  - Files in `/public` go through `asset()` so they work under the repo's sub-path.
  - The script also writes `.nojekyll`, drops `public/screenshots`, and flattens the route prefetch files that this Next.js version exports in a sub-folder but requests by a flat name.
- **Deploy:** `.github/workflows/deploy-pages.yml` builds and publishes on every push to `main`, with base path `/<repo-name>`. The optional repo variable `NEXT_PUBLIC_FEEDBACK_URL` connects the sheet.
- **Prototype banner:** the live site shows a dismissible "Prototype with sample data … Tell us what you think →" banner (`components/app-shell/prototype-banner.tsx`).
- **Visibility:** a GitHub Pages site is public on the internet even if the repo is private (unless the org has GitHub Enterprise access control). The sample data contains real teammate names and work items from the sprint sheet.
