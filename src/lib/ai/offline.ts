import { STATUS_LABELS } from "../config";
import { formatShort, isWeekend } from "../dates";
import { attentionItems, goalProgress } from "../data/selectors";
import type { AppData, Estimate } from "../types";
import type { PlanInput, PlanResult, TidyInput, TidyResult } from "./types";

/**
 * Offline assistant: small rule-based stand-ins for the Claude features, used
 * when the server has no API key. They are deliberately simple and never
 * invent facts; results are labelled as offline suggestions in the UI.
 */

// ── Text clean-up ──────────────────────────────────────────────────────────

const FILLERS: RegExp[] = [
  /\b(?:fixing|fix|sorting|handling|doing|checking|looking into) (?:that|this|it)\b/gi,
  /\b(?:i am|i'm|im|we are|we're|i will|we will|i'll|we'll)\s+/gi,
  /\b(?:basically|actually|just|kind of|sort of|please|currently|right now)\b\s*/gi,
  /\b(?:need to|needs to|have to|has to|trying to|going to|gonna|want to|wanna)\s+/gi,
  /\b(?:working on|work on)\s+/gi,
];

const ISSUE_WORDS = /\b(?:wrong|broken|crash(?:es|ing)?|bug|error|fails?|failing|not working|incorrect|pointing to|doesn't|does not|missing|stuck|slow)\b/i;

const VERBS = new Set(
  "add build create design draft fix implement improve investigate migrate move publish refactor remove rename replace review run set ship split test update validate verify write automate clean configure document enable instrument integrate launch prepare reduce research support upgrade"
    .split(" "),
);

const GERUNDS: Record<string, string> = {
  adding: "Add", building: "Build", creating: "Create", designing: "Design", fixing: "Fix", implementing: "Implement",
  improving: "Improve", investigating: "Investigate", migrating: "Migrate", refactoring: "Refactor", removing: "Remove",
  replacing: "Replace", reviewing: "Review", testing: "Test", updating: "Update", writing: "Write", setting: "Set",
  making: "Make", checking: "Check", moving: "Move", preparing: "Prepare", running: "Run", shipping: "Ship",
};

const AREA = "(?:flow|screen|page|app|tab|modal|dialog|section|settings|api|service|endpoint|dashboard|firmware|bowl|hub|pipeline|form|sheet|view)";

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sentenceCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 15)).trim();
}

function stripFillers(s: string): string {
  let out = ` ${s.replace(/^\s*(?:then|also|and|next|plus|after that|finally|and then)\b[,\s]*/i, "")} `;
  for (const re of FILLERS) out = out.replace(re, " ");
  return collapse(out.replace(/\bsome other\b/gi, "the wrong").replace(/\s+([,.;:])/g, "$1"));
}

export function taskTitleFrom(raw: string): string {
  let s = stripFillers(collapse(raw).replace(/[.!?]+$/, ""));
  if (!s) return "";
  // "In the SOS flow the button is ..." -> "the button is ... in the SOS flow"
  const lead = s.match(new RegExp(`^(?:in|on|within|for) (the |our )?([^,]+?\\b${AREA}),?\\s+(.+)$`, "i"));
  if (lead) s = `${lead[3]} in the ${lead[2]}`;

  const first = s.split(" ")[0].toLowerCase();
  if (GERUNDS[first]) {
    s = `${GERUNDS[first]} ${s.split(" ").slice(1).join(" ")}`;
  } else if (!VERBS.has(first) && ISSUE_WORDS.test(s)) {
    // "the button is pointing to the wrong link" -> "Fix the button pointing to the wrong link"
    s = `Fix ${s.replace(/^(.+?)\s+(?:is|are|was|were|keeps|keep)\s+/i, "$1 ")}`;
  }
  s = s.replace(/^(\w+) the /i, (m, v: string) => (VERBS.has(v.toLowerCase()) || GERUNDS[v.toLowerCase()] ? `${v} ` : m));
  return truncateWords(sentenceCase(s), 80);
}

export function goalTitleFrom(raw: string): string {
  const s = stripFillers(collapse(raw).replace(/^goal\s*[:-]\s*/i, "").replace(/[.!?]+$/, ""));
  return truncateWords(sentenceCase(s), 80);
}

export function tidyOffline(input: TidyInput): TidyResult {
  const source = input.title.trim() || input.notes.split(/[.\n]/)[0] || "";
  const title = input.kind === "task" ? taskTitleFrom(source) : goalTitleFrom(source);
  const notes = [input.notes.trim()];
  // Keep anything that was cut from a long title in the notes.
  if (input.title.trim().length > 90) notes.unshift(`Original: ${collapse(input.title)}`);
  return { title: title || collapse(input.title), notes: notes.filter(Boolean).join("\n") };
}

// ── Plan ───────────────────────────────────────────────────────────────────

const STOP = new Set(
  "the a an and or for with from into onto this that these those have has will need needs make made more less than then when what which while our your their them they just also some other about app new work working".split(" "),
);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function estimateFor(title: string): Estimate {
  if (/\b(build|implement|design|migrate|refactor|integrate|redesign|rewrite|automate)\b/i.test(title)) return 2;
  if (/\b(review|test|copy|check|verify|document|rename|update|confirm|share)\b/i.test(title)) return 0.5;
  return 1;
}

export function planOffline(input: PlanInput): PlanResult {
  const text = input.text.trim();
  let clauses = text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""))
    .filter((l) => l.trim());
  if (clauses.length <= 1) clauses = text.split(/(?<=[.!?])\s+|;\s+|,?\s+and then\s+|,\s+then\s+/i);
  const titles = [...new Set(clauses.map(taskTitleFrom).filter((t) => t.length >= 6))].slice(0, 8);
  const tasks = (titles.length ? titles : [taskTitleFrom(text) || "Describe the first step"]).map((title) => ({
    title,
    estimate: estimateFor(title),
    notes: "",
  }));

  const words = tokens(text);
  let best: { id: string; title: string; score: number } | null = null;
  for (const g of input.goals) {
    const gw = tokens(g.title);
    const overlap = [...gw].filter((w) => words.has(w)).length;
    const score = gw.size ? overlap / gw.size : 0;
    if (overlap >= 2 || (overlap >= 1 && score >= 0.34)) {
      if (!best || score > best.score) best = { id: g.id, title: g.title, score };
    }
  }

  // A new goal is named after the product area the description mentions
  // ("SOS flow" -> "Improve the SOS flow"), else the first clause.
  const areaMatch = [...text.matchAll(new RegExp(`\\b([\\w-]+)\\s+(${AREA.slice(3, -1)})\\b`, "gi"))].find((m) => !/^(?:the|a|an|our|this|that|new)$/i.test(m[1]));
  const newGoalTitle = areaMatch ? `Improve the ${areaMatch[1]} ${areaMatch[2].toLowerCase()}` : goalTitleFrom(clauses[0] ?? text);

  return {
    goal: best
      ? { existingGoalId: best.id, title: best.title, notes: "" }
      : { existingGoalId: null, title: truncateWords(newGoalTitle, 70) || "New goal", notes: "" },
    tasks,
    summary: `Offline suggestion: one task per step in your description${best ? `, under the existing goal “${best.title}”` : ""}. Check the estimates before creating them.`,
  };
}

// ── Chat ───────────────────────────────────────────────────────────────────

interface ChatCtx {
  data: AppData;
  today: string;
  currentUserId: string;
}

const first = (name: string) => name.split(" ")[0];

export function chatOffline(question: string, { data, today, currentUserId }: ChatCtx): string {
  const q = question.toLowerCase();
  const person = new Map(data.people.map((p) => [p.id, p]));
  const nameOf = (id: string) => first(person.get(id)?.name ?? "Someone");
  const items = attentionItems(data, []);

  if (/\bblock/.test(q)) {
    const blocked = items.filter((i) => i.kind === "blocked");
    if (!blocked.length) return "Nothing is blocked right now.";
    return [
      `${blocked.length} blocked:`,
      ...blocked.map(({ task }) => `- ${task.title} (${nameOf(task.ownerId)})${task.dependency ? `, waiting on ${nameOf(task.dependency.personId)}` : ""}`),
    ].join("\n");
  }
  if (/\b(support|waiting|depend|help from|input)\b/.test(q)) {
    const support = items.filter((i) => i.kind === "support");
    if (!support.length) return "Nobody is waiting on anyone right now.";
    return [
      `${support.length} tasks need support (not blocked):`,
      ...support.map(({ task }) => `- ${nameOf(task.ownerId)} needs ${task.dependency ? nameOf(task.dependency.personId) : "someone"}: ${task.dependency?.description ?? task.title}`),
    ].join("\n");
  }
  if (/(not checked in|hasn'?t checked|missing|who.*check)/.test(q)) {
    if (isWeekend(today)) return "Today is a weekend, so no check-ins are expected.";
    const done = new Set(data.checkIns.filter((c) => c.date === today).map((c) => c.personId));
    const missing = data.people.filter((p) => !done.has(p.id));
    return missing.length ? `Not checked in yet today: ${missing.map((p) => first(p.name)).join(", ")}.` : "Everyone has checked in today.";
  }
  if (/\b(goal|progress)\b/.test(q)) {
    return data.goals
      .map((g) => {
        const p = goalProgress(data, g);
        return `- ${g.title}: ${p.done} of ${p.counted} tasks complete${p.blocked ? `, ${p.blocked} blocked` : ""}`;
      })
      .join("\n");
  }
  const named = data.people.find((p) => new RegExp(`\\b${first(p.name).toLowerCase()}\\b`).test(q)) ?? (/\b(me|my|i)\b/.test(q) ? person.get(currentUserId) : undefined);
  if (named) {
    const open = data.tasks.filter((t) => t.ownerId === named.id && (t.status === "in_progress" || t.status === "blocked" || t.status === "not_started"));
    const latest = data.checkIns.filter((c) => c.personId === named.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    return [
      `${first(named.name)} has ${open.length} open ${open.length === 1 ? "task" : "tasks"}:`,
      ...open.map((t) => `- ${t.title} (${STATUS_LABELS[t.status]}, target ${formatShort(t.targetDate)})`),
      latest ? `Last check-in: ${formatShort(latest.date)}.` : "No check-ins yet.",
    ].join("\n");
  }
  if (/\b(standup|summary|summari[sz]e|today|update)\b/.test(q)) {
    const todays = data.checkIns.filter((c) => c.date === today);
    const doneToday = data.tasks.filter((t) => t.completedDate === today);
    const blocked = items.filter((i) => i.kind === "blocked").length;
    const support = items.filter((i) => i.kind === "support").length;
    return [
      `${todays.length} of ${data.people.length} people have checked in today.`,
      `- Done today: ${doneToday.length ? doneToday.map((t) => `${t.title} (${nameOf(t.ownerId)})`).join("; ") : "nothing yet"}`,
      `- Blocked: ${blocked}. Needs support: ${support}.`,
    ].join("\n");
  }
  if (/\b(plan|break|split|tasks? for)\b/.test(q)) {
    return "Describe what you're working on and press “Plan tasks”. I'll suggest a goal and tasks of 0.5 to 2 days that you can create in one step.";
  }
  return [
    "I'm running in offline mode, so I can answer a few kinds of questions from the team's data:",
    "- What's blocked? Who needs support?",
    "- Who hasn't checked in? Summarise today's standup.",
    "- How are the goals going? What is Rupam working on?",
    "Add an ANTHROPIC_API_KEY to the server for full answers.",
  ].join("\n");
}
