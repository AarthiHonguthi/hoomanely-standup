import { chromium } from "playwright-core";

// Usage: npm run build && npx next start -p 3100, then: node scripts/e2e.mjs
// Requires playwright-core (npm i -D playwright-core) and Microsoft Edge (or set BROWSER_CHANNEL=chrome).
// Expectations match the sample data built from the sprint sheet (src/lib/seed/sprint-sheet.ts), with today = Fri 25 Sep 2026.
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failures.push(name);
    console.log("  ✗", name, "\n     ", String(e.message ?? e).split("\n")[0]);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const cards = () => p.locator("article[aria-label*='check-in for']");
const cardOf = (name) => p.locator(`article[aria-label^="${name}'s check-in for"]`);
const cardNames = async () => await cards().evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
async function togglePerson(name) {
  await p.getByRole("button", { name: /^People filter/ }).click();
  await p.locator("[role=dialog] label", { hasText: name }).click();
  await p.keyboard.press("Escape");
}
async function setRange(start, end) {
  await p.getByRole("button", { name: /^Date range/ }).click();
  await p.getByLabel("Start date").fill(start);
  await p.getByLabel("End date").fill(end);
  await p.getByRole("button", { name: "Apply range" }).click();
}
async function switchUser(name) {
  await p.getByRole("button", { name: /Signed in as/ }).click();
  await p.getByRole("option", { name }).click();
}
async function waitToast(text) {
  await p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 4000 });
}

await p.goto(BASE);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForSelector("article");

console.log("Team Today");
await check("defaults to Today: 8 of 13 checked in, others listed as missing", async () => {
  const n = await cards().count();
  assert(n === 8, `expected 8 cards, got ${n}`);
  assert(await p.getByText("8 of 13 checked in").isVisible(), "missing count label");
  assert(await p.getByText("Not checked in yet").isVisible(), "missing 'Not checked in yet'");
});

await check("several task updates inside one person's check-in (Surya, Fri)", async () => {
  const card = cardOf("Surya");
  assert((await card.count()) === 1, "Surya should have one card");
  const rows = await card.locator("li").count();
  assert(rows === 3, `expected 3 updates, got ${rows}`);
});

await check("whole-team selection (Software) filters to its members", async () => {
  await p.getByRole("button", { name: /^People filter/ }).click();
  await p.getByRole("checkbox", { name: "Select the whole Software team" }).click();
  await p.keyboard.press("Escape");
  assert(await p.getByRole("button", { name: "People filter: Software" }).isVisible(), "label shows team");
  const names = await cardNames();
  const software = ["Kunal", "Abhinav", "Rupam", "Aarthi", "Shreya", "Pritam"];
  assert(names.length === 4 && names.every((n) => software.some((s) => n.startsWith(s))), names.join(" | "));
  await p.getByRole("button", { name: "Reset filters" }).click();
});

await check("custom 7-day range groups dates newest first, empty weekend shown compactly", async () => {
  await setRange("2026-09-11", "2026-09-17");
  const headings = await p.locator("main section h3").allInnerTexts();
  assert(headings[0].startsWith("Thursday"), "first should be Thursday: " + headings[0]);
  assert(headings.some((h) => h.startsWith("Sunday")) && headings.some((h) => h.startsWith("Saturday")), "weekend rows expected");
  assert(headings[headings.length - 1].startsWith("Friday"), "last should be Friday");
  assert(await p.getByText("Weekend, no check-ins expected").first().isVisible(), "weekend row");
  assert(await p.getByText("7 days, both included").isVisible(), "header range hint");
});

await check("only Today and Yesterday → today are offered as quick ranges", async () => {
  await p.getByRole("button", { name: /^Date range/ }).click();
  const options = await p.getByRole("option").allInnerTexts();
  await p.keyboard.press("Escape");
  assert(options.length === 2 && options[0].startsWith("Today") && options[1].startsWith("Yesterday through today"), options.join(" | "));
});

await check("historical snapshot: Monday shows In Progress for a task that is Done now", async () => {
  await setRange("2026-09-21", "2026-09-25");
  const title = "Move the Doghouse pet tag order flow to the new production APIs";
  const monCard = p.locator("section[aria-labelledby='day-2026-09-21'] article[aria-label^=\"Kunal's\"]");
  // Updates are ordered by priority, so it may sit under "Show more".
  const more = monCard.getByRole("button", { name: /^Show \d+ more update/ });
  if (await more.count()) await more.click();
  const mon = monCard.locator("li", { hasText: title });
  assert(await mon.getByText("In Progress", { exact: true }).isVisible(), "In Progress on Mon");
  assert(await mon.getByText("Target 21 Sep").isVisible(), "target that day");
  const tueCard = p.locator("section[aria-labelledby='day-2026-09-22'] article[aria-label^=\"Kunal's\"]");
  const moreTue = tueCard.getByRole("button", { name: /^Show \d+ more update/ });
  if (await moreTue.count()) await moreTue.click();
  const tue = tueCard.locator("li", { hasText: title });
  assert(await tue.getByText("Done", { exact: true }).isVisible(), "Done on Tue");
});

await check("check-ins inside a day sorted by person name", async () => {
  const names = await p.locator("section[aria-labelledby='day-2026-09-24'] article").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split("'s")[0]));
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert(names.length >= 2 && JSON.stringify(names) === JSON.stringify(sorted), names.join(","));
});

await check("single person + date filter combined (Surya, Mon–Fri)", async () => {
  await togglePerson("Surya");
  const names = await cardNames();
  assert(names.length === 5 && names.every((n) => n.startsWith("Surya")), names.join(" | "));
});

await check("multiple people (Surya + Vasanth)", async () => {
  await togglePerson("Vasanth");
  const names = await cardNames();
  assert(names.some((n) => n.startsWith("Vasanth")) && names.some((n) => n.startsWith("Surya")), "both present");
  assert(names.every((n) => n.startsWith("Vasanth") || n.startsWith("Surya")), "only those two");
  // Each is the only member of their team, so the label names the teams.
  assert(await p.getByRole("button", { name: "People filter: Mechanical + AI" }).isVisible(), "trigger label");
});

await check("invalid custom range rejected (start after end)", async () => {
  await p.getByRole("button", { name: /^Date range/ }).click();
  await p.getByLabel("Start date").fill("2026-09-25");
  await p.getByLabel("End date").fill("2026-09-20");
  await p.getByRole("button", { name: "Apply range" }).click();
  assert(await p.getByText("The start date is after the end date").isVisible(), "error message");
  await p.keyboard.press("Escape");
  assert(await p.getByRole("button", { name: /^Date range: 21 Sep – 25 Sep/ }).isVisible(), "range unchanged");
});

await check("custom future range shows empty state", async () => {
  await setRange("2026-10-05", "2026-10-06");
  assert(await p.getByText("This date is after today").first().isVisible(), "future message");
});

await check("custom weekend range shows 'No check-ins to show' empty state", async () => {
  await setRange("2026-09-12", "2026-09-13");
  assert(await p.getByText("No check-ins to show").isVisible(), "empty state");
});

await check("reset filters restores Today + Everyone", async () => {
  await p.getByRole("button", { name: "Reset filters" }).click();
  assert((await cards().count()) === 8, "8 cards again");
  assert(await p.getByRole("button", { name: "People filter: Everyone" }).isVisible(), "Everyone");
});

await check("task links are clickable on check-in cards", async () => {
  await setRange("2026-09-17", "2026-09-17");
  const link = cardOf("Aarthi").getByRole("link", { name: /argos_flutter PR #221/ });
  assert((await link.getAttribute("href")) === "https://github.com/hoomanely/argos_flutter/pull/221", "PR link chip");
  assert((await link.getAttribute("target")) === "_blank", "opens in a new tab");
});

await check("sprint filter shows a sprint's check-ins; cards show their sprint", async () => {
  await p.getByRole("button", { name: /^Sprint filter/ }).click();
  assert(await p.getByRole("option", { name: /Sprint 7 · upcoming/ }).isDisabled(), "upcoming sprint disabled");
  assert(await p.getByRole("option", { name: /Sprint 6 · current/ }).isVisible(), "current sprint marked");
  await p.getByRole("option", { name: /Sprint 5$/ }).click();
  assert(await p.getByRole("button", { name: "Sprint filter: Sprint 5" }).isVisible(), "label");
  assert(await p.getByRole("button", { name: /^Date range: 11 Sep – 24 Sep/ }).isVisible(), "range set to the sprint");
  assert(await cards().first().getByText(/Sprint 5 · Checked in/).isVisible(), "card shows sprint");
  await p.getByRole("button", { name: "Reset filters" }).click();
});

await check("new tasks get their sprint from the start date", async () => {
  await p.getByRole("button", { name: "Add task" }).first().click();
  const d = p.getByRole("dialog").filter({ hasText: "Add task" });
  assert(await d.getByText("Sprint 6 · 25 Sep – 8 Oct").isVisible(), "current sprint");
  await d.getByLabel("Start date").fill("2026-10-12");
  assert(await d.getByText("Sprint 7 · 9 Oct – 22 Oct").isVisible(), "next sprint from start date");
  await p.keyboard.press("Escape");
});

await check("only the sprint owner can manage sprints", async () => {
  await p.getByRole("button", { name: /^Sprint filter/ }).click();
  assert(await p.getByText("Sprint dates are set by Rupam.").isVisible(), "read-only note");
  assert((await p.getByRole("button", { name: "Manage sprints" }).count()) === 0, "no manage button for Kunal");
  await p.keyboard.press("Escape");
  await switchUser("Rupam");
  await p.getByRole("button", { name: /^Sprint filter/ }).click();
  await p.getByRole("button", { name: "Manage sprints" }).click();
  const d = p.getByRole("dialog").filter({ hasText: "Manage sprints" });
  await d.getByRole("button", { name: "Add next sprint" }).click();
  assert((await d.getByLabel("Sprint 8 start date").inputValue()) === "2026-10-23", "next fortnight start");
  assert((await d.getByLabel("Sprint 8 end date").inputValue()) === "2026-11-05", "fortnight end");
  await d.getByLabel("Sprint 8 start date").fill("2026-10-20");
  await d.getByRole("button", { name: "Save timeline" }).click();
  assert(await d.getByText("Overlaps Sprint 7.").isVisible(), "overlap rejected");
  await d.getByLabel("Sprint 8 start date").fill("2026-10-23");
  await d.getByRole("button", { name: "Save timeline" }).click();
  await waitToast("Sprint timeline saved");
  await p.getByRole("button", { name: /^Sprint filter/ }).click();
  assert(await p.getByRole("option", { name: /Sprint 8 · upcoming/ }).isVisible(), "new sprint listed");
  await p.keyboard.press("Escape");
  await switchUser("Kunal");
});

await check("profile photos: Aarthi's shows on her card; you can upload, save and remove your own", async () => {
  assert(await cardOf("Aarthi").locator("header img[src*='aarthi']").isVisible(), "Aarthi's photo on her check-in card");
  await p.getByRole("button", { name: "Change your profile photo" }).first().click();
  const d = p.getByRole("dialog").filter({ hasText: "Your profile photo" });
  const input = d.locator("input[type=file]");
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  assert(await d.getByText("Choose a PNG, JPG, WebP or GIF image.").isVisible(), "non-image rejected");
  // A 2x2 red PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
  await input.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await d.locator("img[src^='data:image/jpeg']").waitFor({ timeout: 5000 });
  await d.getByRole("button", { name: "Save photo" }).click();
  await waitToast("Profile photo updated");
  assert(await p.locator("aside button[aria-label='Change your profile photo'] img[src^='data:image/jpeg']").first().isVisible(), "sidebar shows the new photo");
  await p.getByRole("button", { name: "Change your profile photo" }).first().click();
  await d.getByRole("button", { name: "Remove" }).click();
  await d.getByRole("button", { name: "Save photo" }).click();
  await waitToast("Profile photo removed");
  assert((await p.locator("aside button[aria-label='Change your profile photo'] img").count()) === 0, "back to initials");
});

console.log("Goals and tasks");
await p.goto(BASE + "/goals");
await p.waitForSelector("ul[aria-label=Goals] a");
await check("goals page: current sprint by default, sprint filter, progress per goal", async () => {
  assert((await p.locator("#goals-sprint").evaluate((s) => s.options[s.selectedIndex].text)).startsWith("Sprint 6"), "current sprint selected");
  const inSprint = await p.locator("ul[aria-label=Goals] a").count();
  assert(inSprint > 0 && inSprint < 23, "sprint shows a subset: " + inSprint);
  assert(await p.getByRole("img", { name: /goals completed$/ }).isVisible(), "summary ring");
  await p.locator("#goals-sprint").selectOption("all");
  await p.waitForURL(/sprint=all/);
  assert((await p.locator("ul[aria-label=Goals] a").count()) === 23, "23 goals across all sprints");
  const infra = p.locator("ul[aria-label=Goals] a", { hasText: "Infrastructure & backend changes" });
  assert(await infra.getByText("12 of 14").isVisible(), "12 of 14");
});

await check("goal page: filter tasks by contributor and by sprint", async () => {
  await p.locator("ul[aria-label=Goals] a", { hasText: "New App Revamp" }).click();
  await p.waitForSelector("#goal-title");
  const chips = p.getByRole("list", { name: "Filter tasks by contributor" });
  const everyone = await p.locator("li button").filter({ has: p.locator("img, span") }).count();
  assert(everyone > 0, "task rows");
  await chips.getByRole("button", { name: /^Aarthi/ }).click();
  const owners = await p.locator("section ul li button span.block.text-xs").allInnerTexts();
  assert(owners.length > 0 && owners.every((o) => o.startsWith("Aarthi")), "only Aarthi's tasks");
  await chips.getByRole("button", { name: /^Everyone/ }).click();
  await p.getByRole("link", { name: "All goals" }).click();
  await p.waitForSelector("ul[aria-label=Goals] a");
});

await check("goal creation validates vague title and past target; notes are optional", async () => {
  await p.getByRole("button", { name: "New goal" }).click();
  await p.getByLabel("Goal title").fill("test");
  await p.getByRole("button", { name: "Create goal", exact: true }).click();
  assert(await p.getByText("Use at least 8 characters").isVisible(), "title error");
  assert(!(await p.getByText("Describe the outcome in a sentence").count()), "no description requirement");
  await p.getByLabel("Target date").fill("2026-09-01");
  await p.getByRole("button", { name: "Create goal", exact: true }).click();
  assert(await p.getByText("can't be in the past").isVisible(), "past target error");
});

await check("create goal then add a task under it", async () => {
  await p.getByLabel("Goal title").fill("Vet records sharing for pet parents");
  await p.getByLabel("Notes").fill("Share vaccination records with vets. Spec: https://hoomanely.notion.site/vet-records");
  const gd = p.getByRole("dialog").filter({ hasText: "New goal" });
  await gd.getByRole("button", { name: "Add link" }).click();
  await gd.getByLabel("Link 1 name").fill("Vet records spec");
  await gd.getByLabel("Link 1 URL").fill("notion page");
  await p.getByLabel("Target date").fill("2026-10-30");
  await gd.getByRole("button", { name: "Create goal", exact: true }).click();
  assert(await gd.getByText("Enter a full link starting with https://").isVisible(), "bad link URL rejected");
  await gd.getByLabel("Link 1 URL").fill("https://hoomanely.notion.site/vet-records-spec");
  await p.getByRole("button", { name: "Create and add a task" }).click();
  await p.waitForURL(/goal=g-/);
  const dialog = p.getByRole("dialog");
  assert(await dialog.getByText("Add task").first().isVisible(), "task dialog open");
  const selectedText = await dialog.getByRole("combobox", { name: "Goal" }).inputValue();
  assert(selectedText === "Vet records sharing for pet parents", "goal preselected: " + selectedText);
});

await check("goal picker: type to search, starts-with matches first in A–Z order", async () => {
  const dialog = p.getByRole("dialog");
  const box = dialog.getByRole("combobox", { name: "Goal" });
  const options = p.getByRole("listbox", { name: "Goals" }).getByRole("option");
  await box.click();
  await box.fill("e");
  const titles = (await options.allInnerTexts()).map((t) => t.trim());
  const starts = titles.filter((t) => t.toLowerCase().startsWith("e"));
  assert(starts.length > 2 && titles.slice(0, starts.length).join("|") === starts.join("|"), "E-titles on top: " + titles.slice(0, 4).join(" | "));
  const sorted = [...starts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  assert(starts.join("|") === sorted.join("|"), "alphabetical: " + starts.join(" | "));
  await box.fill("everbowl pr");
  assert((await options.first().innerText()).trim() === "EverBowl production station: operator tool", "narrowed per keystroke");
  await box.press("Enter");
  assert((await box.inputValue()) === "EverBowl production station: operator tool", "Enter picks the top match");
  await box.fill("Vet records");
  await box.press("Enter");
  assert((await box.inputValue()) === "Vet records sharing for pet parents", "goal restored");
});

await check("task validation: title, estimate, target before start, dependency", async () => {
  const dialog = p.getByRole("dialog");
  await dialog.getByLabel("Task outcome").fill("todo");
  await dialog.getByLabel("Start date").fill("2026-09-28");
  await dialog.getByLabel("Target finish date").fill("2026-09-25");
  await dialog.getByLabel("Depends on").selectOption({ label: "Rupam" });
  await dialog.getByRole("button", { name: "Create task" }).click();
  assert(await dialog.getByText("Use at least 8 characters").isVisible(), "title");
  assert(await dialog.getByText("Choose 0.5, 1, 1.5 or 2 days").isVisible(), "estimate");
  assert(await dialog.getByText("can't be before the start date").isVisible(), "dates");
  assert(await dialog.getByText("Say what you need from them").isVisible(), "dependency description");
});

await check("task created with valid input and opens its drawer", async () => {
  const dialog = p.getByRole("dialog");
  await dialog.getByLabel("Task outcome").fill("Generate shareable vaccination record PDF");
  await dialog.getByLabel("Estimated effort").selectOption({ label: "1.5 days" });
  await dialog.getByLabel("Target finish date").fill("2026-09-29");
  await dialog.getByLabel("What you need from them").fill("Endpoint for signed PDF links");
  await dialog.getByRole("button", { name: "Add link" }).click();
  await dialog.getByLabel("Link 1 URL").fill("https://www.figma.com/design/vet-pdf");
  // Rupam already has work that day, so a priority is required.
  await dialog.getByRole("group", { name: "Priority" }).getByRole("button", { name: /^P0,/ }).click();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await waitToast("Task created");
  const drawer = p.getByRole("dialog");
  assert(await drawer.getByRole("heading", { name: "Generate shareable vaccination record PDF" }).isVisible(), "drawer title");
  assert(await drawer.getByText("Endpoint for signed PDF links").first().isVisible(), "dependency shown");
  assert(await drawer.getByText("1.5 days").first().isVisible(), "estimate shown");
  assert(await drawer.getByText("P0", { exact: true }).first().isVisible(), "priority shown");
  assert(await drawer.getByRole("link", { name: /figma\.com/ }).isVisible(), "link added in the form, named from the site");
});

await check("result link URL validation and add", async () => {
  const drawer = p.getByRole("dialog");
  await drawer.getByRole("button", { name: "Add result link" }).click();
  await drawer.getByLabel("URL").fill("not a url");
  await drawer.getByRole("button", { name: "Add link" }).click();
  assert(await drawer.getByText("Enter a full link starting with https://").isVisible(), "url error");
  await drawer.getByLabel("URL").fill("javascript:alert(1)");
  await drawer.getByRole("button", { name: "Add link" }).click();
  assert(await drawer.getByText("Only http:// and https:// links").isVisible(), "protocol error");
  await drawer.getByLabel("Label").fill("PDF spec");
  await drawer.getByLabel("URL").fill("https://hoomanely.notion.site/vet-pdf-spec");
  await drawer.getByRole("button", { name: "Add link" }).click();
  assert(await drawer.getByRole("link", { name: /PDF spec/ }).isVisible(), "link listed");
});

await check("edit dependency, changes land in change log", async () => {
  const drawer = p.getByRole("dialog");
  await drawer.getByRole("button", { name: "Edit task" }).click();
  const form = p.getByRole("dialog").filter({ hasText: "Edit task" });
  await form.getByLabel("Depends on").selectOption({ label: "Pritam" });
  await form.getByLabel("What you need from them").fill("Storage bucket for generated PDFs");
  await form.getByLabel("Target finish date").fill("2026-09-30");
  await form.getByRole("button", { name: "Save changes" }).click();
  await waitToast("Task updated");
  const d2 = p.getByRole("dialog");
  assert(await d2.getByText("Storage bucket for generated PDFs").first().isVisible(), "new dependency");
  assert(await d2.getByText("Moved 1 time").isVisible(), "target moved");
  await d2.getByRole("tab", { name: /Change log/ }).click();
  assert(await d2.getByText("Dependency on").first().isVisible(), "dependency event");
  assert(await d2.getByText("Target moved").first().isVisible(), "target event");
});

await check("status → Done records completion date; → Dropped requires a reason", async () => {
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: "Change status" }).click();
  await d.getByLabel("New status").selectOption("done");
  await d.getByRole("button", { name: "Save status" }).click();
  await waitToast("Status changed to Done");
  assert(await d.getByText("Completed").first().isVisible(), "completed field");
  assert(await d.getByText("25 Sep 2026").first().isVisible(), "completion date");
  await d.getByRole("button", { name: "Change status" }).click();
  await d.getByLabel("New status").selectOption("dropped");
  await d.getByRole("button", { name: "Save status" }).click();
  assert(await d.getByText("Say why this task is being dropped.").isVisible(), "reason required");
  await d.getByLabel("Why is it being dropped?").fill("Vets prefer the existing email flow for now.");
  await d.getByRole("button", { name: "Save status" }).click();
  await waitToast("Status changed to Dropped");
  assert(await d.getByText("Why it was dropped").isVisible(), "drop reason shown");
  assert(!(await d.getByText("Completed", { exact: true }).isVisible()), "completion cleared");
  await d.getByRole("tab", { name: /Change log/ }).click();
  const statusEvents = await d.getByText(/^Status /).count();
  assert(statusEvents >= 2, "status history retained: " + statusEvents);
});

await check("dropped task not counted as complete on the goal", async () => {
  await p.keyboard.press("Escape");
  await p.goto(BASE + "/goals?sprint=all");
  const card = p.locator("ul[aria-label=Goals] a", { hasText: "Vet records sharing" });
  await card.waitFor();
  assert(await card.getByText("0 of 0").isVisible(), "0 of 0");
  assert(await card.getByText("1 dropped").isVisible(), "1 dropped");
});

await check("goal notes render links", async () => {
  await p.locator("ul[aria-label=Goals] a", { hasText: "Vet records sharing" }).click();
  await p.waitForSelector("#goal-title");
  assert(await p.getByRole("link", { name: /hoomanely\.notion\.site\/vet-records/ }).isVisible(), "notes link");
  const chip = p.locator("ul[aria-label='Links']").getByRole("link", { name: /Vet records spec/ });
  assert((await chip.getAttribute("href")) === "https://hoomanely.notion.site/vet-records-spec", "goal link chip");
});

await check("carry over records destination sprint and reason", async () => {
  await p.goto(BASE + "/goals?goal=g-infra");
  await p.getByRole("button", { name: /Migrate existing user and device data/ }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: "Change status" }).click();
  await d.getByLabel("New status").selectOption("carried_over");
  await d.getByLabel("Destination sprint").selectOption({ label: "Sprint 7" });
  await d.getByLabel("Why is it carrying over?").fill("Waiting for the production cut-over before migrating.");
  await d.getByRole("button", { name: "Save status" }).click();
  await waitToast("Carried Over");
  assert(await d.getByText("Sprint 6 → Sprint 7").first().isVisible(), "carry-over info");
  await d.getByRole("tab", { name: /Change log/ }).click();
  assert(await d.getByText(/Carried over Sprint 6/).first().isVisible(), "carry-over event");
  await p.keyboard.press("Escape");
});

await check("other people's tasks are read-only", async () => {
  await p.getByRole("button", { name: /Close the open calls the dev rehearsal surfaced/ }).click();
  const d = p.getByRole("dialog");
  assert(await d.getByText("Only Rupam can edit this task.").isVisible(), "read-only note");
  assert((await d.getByRole("button", { name: "Edit task" }).count()) === 0, "no edit");
  await p.keyboard.press("Escape");
});

console.log("Stand-up summary");
await check("nav order ends with Stand-up summary and My workspace (no Sprint report for non-managers)", async () => {
  const labels = await p.locator("aside[aria-label='Main navigation'] nav a").allInnerTexts();
  assert(JSON.stringify(labels.map((l) => l.trim())) === JSON.stringify(["Team Today", "Goals", "Stand-up summary", "My workspace", "Feedback"]), "nav: " + labels.join(" | "));
});
await check("stand-up summary builds notes for the chosen day from check-ins", async () => {
  await p.goto(BASE + "/standup");
  await p.waitForSelector("#notes-heading");
  assert(await p.getByRole("heading", { name: "Stand-up · Friday, 25 Sep 2026" }).isVisible(), "today's notes");
  assert(await p.getByRole("heading", { name: "Action items" }).isVisible(), "action items");
  await p.locator("[data-date='2026-09-12']").click();
  assert(await p.getByText("Weekend. No stand-up on this day.").isVisible(), "weekend empty state");
  await p.locator("[data-date='2026-09-17']").click();
  assert(await p.getByRole("button", { name: "SOS UI screens corrected as per the email" }).isVisible(), "Aarthi's update in the notes");
  assert(await p.getByRole("heading", { name: "Discussion" }).isVisible(), "discussion");
});

await check("stand-up notes can be edited, persist, and reset to generated", async () => {
  await p.goto(BASE + "/standup");
  await p.waitForSelector("#notes-heading");
  const doc = p.locator("article[aria-labelledby='notes-heading']");
  await doc.getByRole("button", { name: "Edit notes" }).click();
  const form = p.getByRole("form", { name: "Edit meeting notes" });
  await form.getByLabel("Summary").fill("Short stand-up. @aarthi demoed the SOS flow.");
  await form.getByRole("button", { name: "Add action item" }).click();
  const n = await form.getByLabel(/^Action item \d+$/).count();
  await form.getByLabel(`Action item ${n}`, { exact: true }).fill("@Pranjal to share the Figma file with @Aarthi");
  await form.getByRole("button", { name: "Save notes" }).click();
  assert(await doc.getByText("demoed the SOS flow.").isVisible(), "edited summary shown");
  assert(await doc.getByText(/Edited by Kunal/).isVisible(), "edited by");
  assert(!(await doc.getByText("@aarthi").count()), "mention turned into a name");
  const newItem = doc.getByLabel(`Action item ${n} done`);
  await newItem.click();
  assert((await newItem.getAttribute("data-state")) === "checked", "action item ticked");
  await p.reload();
  await p.waitForSelector("#notes-heading");
  assert(await doc.getByText("demoed the SOS flow.").isVisible(), "edits persist after reload");
  assert((await doc.getByLabel(`Action item ${n} done`).getAttribute("data-state")) === "checked", "tick persists");
  await doc.getByRole("button", { name: "Reset to generated notes" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Reset notes" }).click();
  assert(await doc.getByText(/people checked in/).isVisible(), "generated notes back");
  assert(!(await doc.getByText(/Edited by/).count()), "edited label gone");
});

console.log("Sprint report");
await check("sprint report is locked for non-managers", async () => {
  await p.goto(BASE + "/sprint-report");
  await p.getByRole("heading", { name: "The sprint report is for managers" }).waitFor();
  assert(await p.getByText("Only Rupam can see it.").isVisible(), "names the manager");
  assert(!(await p.locator("#retro-heading").count()), "no report content");
});

await check("sprint report opens on the last finished sprint with numbers, burndown and scorecard (as Rupam)", async () => {
  await switchUser("Rupam");
  await p.waitForSelector("#retro-heading");
  const nav = await p.locator("aside[aria-label='Main navigation'] nav a").allInnerTexts();
  assert(nav.map((l) => l.trim()).join("|") === "Team Today|Goals|Stand-up summary|Sprint report|My workspace|Feedback", "manager nav: " + nav.join("|"));
  const picker = p.getByLabel("Sprint", { exact: true });
  assert((await picker.evaluate((s) => s.options[s.selectedIndex].text)).startsWith("Sprint 5"), "Sprint 5 by default");
  assert(await p.getByText("Ended", { exact: true }).isVisible(), "ended badge");
  assert(/^\d+ \/ \d+$/.test(await p.locator("dt:text-is('Done') + dd").innerText()), "done count");
  const chart = p.getByRole("img", { name: /^Burndown\./ });
  assert(await chart.isVisible(), "burndown chart");
  await chart.focus();
  assert(await p.getByText("Work left", { exact: false }).first().isVisible(), "tooltip on focus");
  await p.getByRole("button", { name: "Show as table" }).click();
  assert((await p.locator("table tbody tr").count()) === 10, "10 working days in the table");
  assert(await p.getByRole("button", { name: /^Show all \d+ goals$/ }).isVisible(), "scorecard is trimmed");
  assert(!(await p.getByText("Partly done (0/").count()), "no 'partly done' for goals with nothing done");
});

await check("retro board: data cards, add / +1 / remove your own card", async () => {
  const col = p.getByRole("group", { name: "Try next" });
  assert(await p.getByText("From sprint data").first().isVisible(), "insight cards");
  await col.getByLabel("Add a card to Try next").fill("Demo the feature at the end of each sprint");
  await col.getByLabel("Add a card to Try next").press("Enter");
  const vote = col.getByRole("button", { name: /\+1 card: Demo the feature/ });
  await vote.click();
  assert((await col.getByRole("button", { name: /Remove your \+1 from card: Demo the feature/ }).getAttribute("aria-pressed")) === "true", "voted");
  await col.getByRole("button", { name: "Remove card: Demo the feature at the end of each sprint" }).click();
  assert(!(await col.getByText("Demo the feature at the end of each sprint").count()), "removed");
  assert(!(await col.getByRole("button", { name: /Remove card: Share Figma links/ }).count()), "can't remove someone else's card");
});

await check("draft sprint email follows the manager's format and is signed by the manager", async () => {
  await p.getByRole("button", { name: "Draft sprint email" }).click();
  const box = p.getByRole("dialog").getByLabel("Sprint email");
  const text = await box.inputValue();
  for (const part of ["SUMMARY", "SPRINT SCORECARD", "ENGINEERING NUMBERS THAT MATTER", "GOAL DETAIL", "Best regards,\nRupam"]) assert(text.includes(part), "has " + part);
  assert((text.match(/\[CONFIRM/g) ?? []).length <= 6, "only a few placeholders");
  await p.keyboard.press("Escape");
  await switchUser("Kunal");
});

console.log("Feedback");
await check("feedback page: anonymous by default, idea sparks fill the note, needs text", async () => {
  await p.goto(BASE + "/feedback");
  const form = p.getByRole("form", { name: "Feedback" });
  await form.waitFor();
  assert(await p.getByText("your feedback is anonymous unless you add your name").isVisible(), "anonymous note");
  await form.getByRole("button", { name: "Send feedback" }).click();
  assert(await p.getByText("Write a few words first.").isVisible(), "empty note refused");
  await p.getByRole("button", { name: "What slows down code review for you today?" }).click();
  assert((await form.getByLabel("Your thoughts").inputValue()).includes("• What slows down code review for you today?"), "spark added to the note");
  await form.getByRole("button", { name: "How we work (PRs, stories, bugs)" }).click();
  assert((await form.getByRole("button", { name: "How we work (PRs, stories, bugs)" }).getAttribute("aria-pressed")) === "true", "topic chosen");
});

console.log("My work");
await check("My work shows my summary and calendar only; own tasks are editable from the day panel", async () => {
  await p.goto(BASE + "/me");
  await p.waitForSelector("#calendar-heading");
  assert(await p.getByRole("heading", { name: "Kunal's workspace" }).isVisible(), "heading");
  assert(await p.getByText("1 blocked").isVisible() && (await p.getByText("2 past target").isVisible()), "summary");
  assert((await p.locator("#my-tasks-heading, #my-goals-heading, #timeline-heading").count()) === 0, "task list, goals and timeline removed");
  assert((await p.getByRole("button", { name: "Ask Raana, the AI assistant" }).count()) === 0, "no Raana launcher on My work");
  await p.getByRole("button", { name: "Edit Fix the quiz showing unanswered after logging out and back in" }).click();
  const form = p.getByRole("dialog").filter({ hasText: "Edit task" });
  assert(await form.getByLabel("Task outcome").isVisible(), "edit form opens from the calendar");
  assert((await form.getByLabel("Task outcome").inputValue()).startsWith("Fix the quiz"), "right task");
  await p.keyboard.press("Escape");
});

await check("task priority: chosen in Add task from the levels in use, day sorted P0 first", async () => {
  await p.goto(BASE + "/me");
  await p.waitForSelector("#calendar-heading");
  await p.getByRole("button", { name: "Add task", exact: true }).first().click();
  const d = p.getByRole("dialog").filter({ hasText: "Add task" });
  const group = d.getByRole("group", { name: "Priority" });
  const offered = (await group.getByRole("button").allInnerTexts()).map((t) => t.trim().split(/\s/)[0]);
  // Levels offered: P0 up to one past the highest already used that day.
  assert(offered.length >= 2 && offered.every((l, i) => l === `P${i}`), "contiguous levels from P0: " + offered.join("|"));
  assert(await d.getByText("Your other tasks that day").isVisible(), "other tasks listed with their priority");
  const lowest = offered[offered.length - 1];
  await d.getByLabel("Task outcome").fill("Prepare the weekly release checklist");
  await d.getByLabel("Estimated effort").selectOption({ label: "0.5 days" });
  await d.getByRole("button", { name: "Create task" }).click();
  assert(await d.getByText("Choose a priority.", { exact: false }).isVisible(), "priority is required");
  await group.getByRole("button", { name: new RegExp(`^${lowest},`) }).click();
  await d.getByRole("button", { name: "Create task" }).click();
  await waitToast("Task created");
  await p.keyboard.press("Escape");
  const panel = p.locator("[aria-labelledby='day-panel-heading']");
  const items = panel.locator("li");
  const n = await items.count();
  assert((await items.nth(n - 1).innerText()).includes("Prepare the weekly release checklist"), "lowest-priority task listed last");
  assert((await items.first().innerText()).includes("P0"), "P0 first");
  assert((await p.locator("[data-date='2026-09-25']").innerText()).includes("P0 "), "calendar chip shows P0");
  await p.getByRole("button", { name: "Add task", exact: true }).first().click();
  const next = (await p.getByRole("dialog").getByRole("group", { name: "Priority" }).getByRole("button").allInnerTexts()).map((t) => t.trim().split(/\s/)[0]);
  assert(next.length === Math.min(offered.length + 1, 4), "one more level is offered next time: " + next.join("|"));
  await p.keyboard.press("Escape");
});

await check("My pace: walk through the park in priority order; ticking a task walks on", async () => {
  await p.goto(BASE + "/me");
  await p.waitForSelector("#pace-heading");
  const pace = p.locator("section[aria-labelledby='pace-heading']");
  assert(await pace.getByText("Only you can see this").isVisible(), "private label");
  const ring = pace.getByRole("img", { name: /done$|^Planned$/ });
  const pct = async () => parseInt((await ring.getAttribute("aria-label")) ?? "0");
  const boards = pace.getByRole("list", { name: "Your tasks along today's walk" }).getByRole("button");
  const labels = async () => (await boards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "")));
  const n = await boards.count();
  assert(n >= 2 && n === (await pace.getByRole("checkbox").count()), "one board and one checkbox per task: " + n);
  assert((await boards.first().innerText()).trim().match(/^P\d$/), "boards show just the priority");
  const prios = (await labels()).map((l) => Number(l.match(/, P(\d),/)[1]));
  assert(prios.every((v, i) => i === 0 || prios[i - 1] <= v), "boards in priority order: " + prios.join(","));
  const firstOpen = (await labels()).findIndex((l) => !l.includes(", done."));
  assert((await labels())[firstOpen].includes("next up"), "next board is the first unfinished one");
  const before = await pct();
  await pace.getByRole("checkbox", { name: /^Not done: Fetch Community posts by region/ }).click();
  await waitToast("Nice, crossed off");
  assert((await pct()) > before, "ring went up");
  assert((await labels()).some((l) => l.startsWith("Fetch Community posts by region") && l.includes(", done.")), "its board is ticked");
  await pace.getByRole("checkbox", { name: /^Done: Fetch Community posts by region/ }).click();
  await waitToast("Marked as in progress");
  assert((await pct()) === before, "unticking restores it");
  // Clicking a board opens the task.
  await boards.first().click();
  await p.getByRole("dialog").getByText("Task details, current status and update history").waitFor({ state: "attached" });
  await p.keyboard.press("Escape");
  assert(await pace.getByRole("button", { name: "Play a whole day of sky" }).isVisible(), "sky preview control");
});

await check("My pace: pick up the walker; scared up high, dizzy after a fall, then walks home", async () => {
  const face = () => p.locator(".walker-person-layer").getAttribute("data-face");
  await p.locator(".walk-scene").scrollIntoViewIfNeeded();
  await p.waitForTimeout(3500); // let the opening walk finish
  const bb = await p.locator("[data-who=person]").boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(bb.x + bb.width / 2 + i * 20, bb.y + bb.height / 2 - i * 13, { steps: 2 });
  assert((await face()) === "scared", "scared when lifted high");
  await p.mouse.up();
  await p.waitForFunction(() => document.querySelector(".walker-person-layer")?.getAttribute("data-face") === "dizzy", null, { timeout: 3000 });
  await p.waitForFunction(
    () => {
      const el = document.querySelector(".walker-person-layer");
      return el?.getAttribute("data-face") === "happy" && el.parentElement?.style.transform === "translate(0px, 0px) rotate(0deg)";
    },
    null,
    { timeout: 8000 },
  );
});

await check("My pace: past days are read-only, weekends rest; never shown to others", async () => {
  const pace = p.locator("section[aria-labelledby='pace-heading']");
  await p.locator("[data-date='2026-09-24']").click();
  assert(await pace.getByRole("heading", { name: "My pace · Thu 24 Sep" }).isVisible(), "follows the calendar");
  assert(await pace.getByText("What got done that day, from your check-ins.").isVisible(), "past day");
  assert((await pace.getByRole("checkbox").first().isDisabled()), "past checklist is read-only");
  await p.locator("[data-date='2026-09-26']").click();
  assert(await pace.getByText("Rest day. Nothing planned.").isVisible(), "weekend");
  await p.locator("[data-date='2026-09-25']").click();
  await p.goto(BASE + "/");
  await p.waitForSelector("article");
  assert(!(await p.locator("#pace-heading").count()), "not on Team Today");
});

await check("My workspace: + on the day panel adds a task with that date filled in", async () => {
  await p.goto(BASE + "/me");
  await p.waitForSelector("#calendar-heading");
  assert((await p.locator("main").getByRole("button", { name: "Add task", exact: true }).count()) <= 1, "page-level Add task removed");
  await p.locator("[data-date='2026-09-29']").click();
  await p.getByRole("button", { name: "Add a task on Tue 29 Sep" }).click();
  const d = p.getByRole("dialog").filter({ hasText: "Add task" });
  assert((await d.getByLabel("Start date").inputValue()) === "2026-09-29", "start date filled");
  assert((await d.getByLabel("Target finish date").inputValue()) === "2026-09-29", "target date filled");
  await p.keyboard.press("Escape");
  await p.locator("[data-date='2026-09-25']").click();
});

await check("calendar shows the month and the selected day's tasks", async () => {
  const cal = p.locator("section[aria-labelledby='calendar-heading']");
  assert((await cal.getByRole("button", { name: "September 2026, current month" }).innerText()) === "September 2026", "current month");
  const panel = cal.locator("[aria-labelledby='day-panel-heading']");
  assert((await panel.locator("h4").innerText()) === "Fri 25 Sep", "today selected");
  assert(await panel.getByText("Fix the quiz showing unanswered after logging out and back in").isVisible(), "today's done task");
  await cal.locator("button[data-date='2026-09-07']").click();
  const blocked = panel.locator("li", { hasText: "Change the delivery charges for pet tag orders" });
  assert(await blocked.getByText("Blocked", { exact: true }).isVisible(), "blocked on 7 Sep (recorded)");
  await cal.locator("button[data-date='2026-09-28']").click();
  const release = panel.locator("li", { hasText: "Make iOS and Android releases developer-agnostic" });
  assert(await release.getByText("Due", { exact: true }).isVisible(), "due on 28 Sep");
  assert(await release.getByText("Planned", { exact: true }).isVisible(), "planned");
  await cal.getByRole("button", { name: "Previous month" }).click();
  assert(await cal.getByRole("button", { name: /^August 2026/ }).isVisible(), "previous month");
  await cal.locator("button[data-date='2026-08-31']").click();
  assert(await panel.getByText("Set up Amazon SES for the new app's production environment").isVisible(), "31 Aug task");
  const monthButton = cal.getByRole("button", { name: /Go back to September 2026/ });
  assert((await monthButton.innerText()) === "August 2026", "month button shows the month being viewed");
  await monthButton.click();
  assert(await cal.getByRole("button", { name: "September 2026, current month" }).isVisible(), "back to this month");
  assert((await cal.getByRole("button", { name: "September 2026, current month" }).innerText()) === "September 2026", "label is the current month");
  await cal.locator("button[data-date='2026-09-25']").focus();
  await p.keyboard.press("ArrowLeft");
  assert((await panel.locator("h4").innerText()) === "Thu 24 Sep", "arrow key moves a day");
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("data-date"));
  assert(focused === "2026-09-24", "focus follows: " + focused);
});

await check("goal creator can edit a goal; others can't", async () => {
  await p.goto(BASE + "/goals?goal=g-infra");
  await p.waitForSelector("#goal-title");
  assert((await p.getByRole("button", { name: "Edit goal" }).count()) === 0, "Kunal can't edit Rupam's goal");
  await p.goto(BASE + "/goals?goal=g-release");
  await p.waitForSelector("#goal-title");
  await p.getByRole("button", { name: "Edit goal" }).click();
  const d = p.getByRole("dialog").filter({ hasText: "Edit goal" });
  await d.getByLabel("Goal title").fill("New app release stabilisation, monitoring and store launch");
  await d.getByLabel("Target date").fill("2026-09-01");
  await d.getByRole("button", { name: "Save changes" }).click();
  assert(await d.getByText("The target date can't be in the past.").isVisible(), "past date rejected");
  await d.getByLabel("Target date").fill("2026-10-16");
  await d.getByRole("button", { name: "Save changes" }).click();
  await waitToast("Goal updated");
  await p.goto(BASE + "/goals?goal=g-release");
  await p.waitForSelector("#goal-title");
  assert((await p.locator("#goal-title").innerText()).includes("monitoring and store launch"), "title saved");
  assert(await p.getByText("Target 16 Oct 2026").isVisible(), "target saved");
});

console.log("Check-ins");
await check("publish check-in as Rupam (no check-in yet today)", async () => {
  await p.goto(BASE);
  await switchUser("Rupam");
  assert(await p.getByRole("button", { name: /^My check-in/ }).isVisible(), "My check-in label");
  await p.getByRole("button", { name: /^My check-in/ }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("checkbox", { name: /Include Close the open calls/ }).click();
  await d.getByRole("button", { name: "Publish check-in" }).click();
  assert(await d.getByText("Write a short progress update.").isVisible(), "progress required");
  await d.getByLabel("Progress update").fill("Listed the open calls from the rehearsal; three need owners.");
  await d.getByLabel("Status today").selectOption("blocked");
  await d.getByRole("button", { name: "Publish check-in" }).click();
  assert(await d.getByText("Say what is blocking you").isVisible(), "blocked needs reason");
  await d.getByLabel("Status today").selectOption("in_progress");
  await d.getByLabel("Depends on").selectOption({ label: "Kunal" });
  await d.getByLabel("What you need from them").fill("Confirm the migration cut-over date");
  await d.getByRole("button", { name: "Publish check-in" }).click();
  await waitToast("Check-in published");
  assert((await cards().count()) === 9, "9 cards now");
  assert(await p.getByText("9 of 13 checked in").isVisible(), "9 of 13");
  assert(await cardOf("Rupam").getByText("Needs support").isVisible(), "needs support, not blocked");
});

await check("editing the check-in updates the same card (no duplicate)", async () => {
  await p.getByRole("button", { name: /Edit my check-in/ }).click();
  const d = p.getByRole("dialog");
  assert(await d.getByText("Saving updates this check-in").isVisible(), "edit mode");
  await d.getByLabel("Progress update").fill("Two of the three open calls now have owners.");
  await d.getByLabel("Note for the team").fill("Rehearsal notes shared in the channel.");
  await d.getByRole("button", { name: "Update check-in" }).click();
  await waitToast("Check-in updated");
  const card = cardOf("Rupam");
  assert((await card.count()) === 1, "still one card");
  assert(await card.getByText("Two of the three open calls now have owners.").isVisible(), "updated text");
  assert(await card.getByText(/edited \d\d:\d\d/).isVisible(), "edited marker");
});

await check("Done in a check-in sets completion date", async () => {
  await p.getByRole("button", { name: /Edit my check-in/ }).click();
  const d = p.getByRole("dialog");
  await d.getByLabel("Status today").selectOption("done");
  await d.getByRole("button", { name: "Update check-in" }).click();
  await waitToast("Check-in updated");
  await cardOf("Rupam").getByRole("button", { name: /Close the open calls/ }).click();
  const drawer = p.getByRole("dialog");
  assert(await drawer.getByText("Completed").first().isVisible(), "completed");
  await p.keyboard.press("Escape");
});

console.log("AI assistant (offline mode)");
await check("assist API reports offline mode without a key", async () => {
  const mode = await p.evaluate(async () => (await (await fetch("/api/assist")).json()).mode);
  assert(mode === "offline", "mode " + mode);
});

await check("Tidy with AI rewrites a rough task title only after 'Use this'", async () => {
  await p.getByRole("button", { name: "Add task" }).first().click();
  const dialog = p.getByRole("dialog").filter({ hasText: "Add task" });
  const title = dialog.getByLabel("Task outcome");
  await title.fill("In the SOS Flow the button is pointing to some other link fixing that");
  await dialog.getByRole("button", { name: "Tidy with AI" }).click();
  const pop = p.getByRole("dialog").filter({ hasText: "Suggested task" });
  await pop.getByRole("button", { name: "Use this" }).waitFor();
  const suggestion = await pop.locator("p.font-medium").first().innerText();
  assert(/^Fix /.test(suggestion) && /SOS Flow/i.test(suggestion) && !/fixing that/i.test(suggestion), "suggestion: " + suggestion);
  assert((await title.inputValue()).startsWith("In the SOS"), "unchanged before apply");
  await pop.getByRole("button", { name: "Use this" }).click();
  assert((await title.inputValue()) === suggestion, "applied");
  await p.keyboard.press("Escape");
});

await check("chat answers 'What's blocked' from team data", async () => {
  await p.goto(BASE);
  await p.waitForSelector("article");
  await p.getByRole("button", { name: "Ask Raana, the AI assistant" }).click();
  const panel = p.getByRole("dialog", { name: "Ask Raana, AI assistant" });
  await panel.getByRole("button", { name: "What's blocked right now?" }).click();
  await panel.getByText("Change the delivery charges for pet tag orders").first().waitFor({ timeout: 8000 });
  assert(await panel.getByText("Offline", { exact: true }).isVisible(), "offline badge");
});

await check("plan mode suggests tasks and creates them under a new goal", async () => {
  const panel = p.getByRole("dialog", { name: "Ask Raana, AI assistant" });
  await panel.getByRole("button", { name: "Plan tasks mode" }).click();
  await panel.getByLabel("Describe what you're working on").fill(
    "In the SOS flow the button is pointing to the wrong link. Then add analytics events to the SOS screen. Review the SOS copy with Sanyukta.",
  );
  await panel.getByRole("button", { name: "Plan tasks", exact: true }).click();
  const create = panel.getByRole("button", { name: /Create goal and 3 tasks/ });
  await create.waitFor({ timeout: 8000 });
  const firstTitle = await panel.getByLabel("Task 1 title").inputValue();
  assert(/^Fix /.test(firstTitle), "task 1: " + firstTitle);
  const secondTitle = await panel.getByLabel("Task 2 title").inputValue();
  assert(/^Add analytics/.test(secondTitle), "task 2: " + secondTitle);
  const goalTitle = await panel.getByLabel("Goal title").inputValue();
  assert(goalTitle === "Improve the SOS flow", "goal: " + goalTitle);
  await create.click();
  await waitToast("3 tasks created");
  await panel.getByRole("link", { name: "View goal" }).click();
  await p.waitForURL(/goal=g-/);
  await p.waitForSelector("#goal-title");
  assert((await p.locator("section[aria-label='In flight'] li").count()) === 3, "3 tasks in new goal");
});

await check("Escape closes the assistant and returns focus to the launcher", async () => {
  await p.getByRole("button", { name: "Ask Raana, the AI assistant" }).click();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  const label = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  assert(label === "Ask Raana, the AI assistant", "focus: " + label);
});

console.log("Persistence");
await check("edits persist after refresh; demo user persists", async () => {
  await p.goto(BASE);
  await p.waitForSelector("article");
  assert((await cards().count()) === 9, "Rupam's check-in persisted");
  assert(await p.getByRole("button", { name: /Signed in as Rupam/ }).isVisible(), "user persisted");
});

await check("theme toggles and persists across reload", async () => {
  await p.getByRole("button", { name: "Switch to dark mode" }).click();
  assert(await p.evaluate(() => document.documentElement.classList.contains("dark")), "dark applied");
  await p.reload();
  await p.waitForSelector("article");
  assert(await p.evaluate(() => document.documentElement.classList.contains("dark")), "dark after reload");
  assert(await p.getByRole("button", { name: "Switch to light mode" }).isVisible(), "toggle label in sync");
});

await check("reset demo data restores seed but keeps theme", async () => {
  await p.getByRole("button", { name: "Reset demo data" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Reset demo data" }).click();
  await waitToast("Demo data restored");
  assert((await cards().count()) === 8, "back to 8 cards");
  assert(await p.evaluate(() => document.documentElement.classList.contains("dark")), "still dark");
  await p.goto(BASE + "/goals?sprint=all");
  await p.waitForSelector("ul[aria-label=Goals] a");
  assert((await p.locator("ul[aria-label=Goals] a").count()) === 23, "23 goals");
});

await check("malformed localStorage recovers with a notice", async () => {
  await p.evaluate(() => localStorage.setItem("hoomanely.demo-data", "{not json"));
  await p.goto(BASE);
  await p.waitForSelector("article");
  await p.getByText("Saved demo data was unreadable").waitFor({ timeout: 5000 });
  assert(await p.getByText("Saved demo data was unreadable").isVisible(), "notice");
  assert((await cards().count()) >= 8, "seed data shown");
});

await check("incompatible schema version recovers", async () => {
  await p.evaluate(() => localStorage.setItem("hoomanely.demo-data", JSON.stringify({ schemaVersion: 99, data: {} })));
  await p.reload();
  await p.waitForSelector("article");
  assert(await p.getByText("incompatible version (v99)").isVisible(), "notice");
});

await check("structurally broken data recovers", async () => {
  await p.evaluate(() => {
    const env = JSON.parse(localStorage.getItem("hoomanely.demo-data"));
    env.data.tasks[0].estimate = 3;
    localStorage.setItem("hoomanely.demo-data", JSON.stringify(env));
  });
  await p.reload();
  await p.waitForSelector("article");
  assert(await p.getByText("invalid estimate").isVisible(), "notice");
  await p.getByRole("button", { name: "Dismiss notice" }).click();
});

await check("keyboard: Escape closes drawer and focus returns to trigger", async () => {
  const btn = p.getByRole("button", { name: "Change the delivery charges for pet tag orders for US and Indian users" }).first();
  await btn.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog").waitFor();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  const focused = await p.evaluate(() => document.activeElement?.textContent);
  assert(focused?.includes("Change the delivery charges"), "focus restored: " + focused);
});

await check("no horizontal overflow at 390px", async () => {
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/me", "/goals", "/goals?goal=g-release"]) {
    await p.goto(BASE + path);
    await p.waitForTimeout(400);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    assert(sw <= 390, `${path} scrollWidth ${sw}`);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log("Failed:", failures);
console.log("Page errors:", errors.length ? errors : "none");
await browser.close();
