"use client";

import { AlertTriangle, Ban, CheckCircle2, Circle, CircleDashed, Copy, Lock, Mail, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BurndownChart } from "@/components/charts/burndown-chart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { formatRange } from "@/lib/dates";
import {
  buildSprintReport,
  defaultReportSprint,
  formatDays,
  goalLabel,
  pct,
  reportableSprints,
  sprintEmailText,
  type GoalHealth,
  type SprintReport as Report,
} from "@/lib/data/sprint-report";
import { useData, useLookups } from "@/lib/data/store";
import { cn, plural } from "@/lib/utils";
import { RetroBoard } from "./retro-board";

/** Goals listed before "Show all"; at-risk and unfinished goals sort first. */
const GOALS_SHOWN = 8;

const HEALTH_STYLE: Record<GoalHealth, { className: string; icon: typeof Circle }> = {
  done: { className: "bg-[var(--success-bg)] text-[var(--success-fg)]", icon: CheckCircle2 },
  on_track: { className: "bg-[var(--reef-bg)] text-[var(--reef-fg)]", icon: Timer },
  at_risk: { className: "bg-[var(--error-bg)] text-[var(--error-fg)]", icon: AlertTriangle },
  unfinished: { className: "bg-[var(--warning-bg)] text-[var(--warning-fg)]", icon: CircleDashed },
  not_started: { className: "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]", icon: Ban },
};

/** Sprint numbers for the whole team: planned vs done, burndown, goal scorecard and the retro board. Managers only (a frontend rule). */
export function SprintReport() {
  const { data, currentUserId, hydrated } = useData();
  const isManager = Boolean(data.people.find((p) => p.id === currentUserId)?.canManageSprints);
  if (!hydrated) return null;
  if (!isManager) {
    const managers = data.people.filter((p) => p.canManageSprints).map((p) => p.name);
    return (
      <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-2 rounded-card border border-border bg-surface p-8 text-center shadow-card">
        <Lock className="size-5 text-subtle" aria-hidden />
        <h2 className="text-base font-semibold">The sprint report is for managers</h2>
        <p className="text-sm text-muted">Only {managers.join(", ") || "the sprint owner"} can see it. Your own numbers are in My workspace.</p>
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <Link href="/me">Go to My workspace</Link>
        </Button>
      </div>
    );
  }
  return <ManagerReport />;
}

function ManagerReport() {
  const { data, today } = useData();
  const sprints = useMemo(() => reportableSprints(data, today), [data, today]);
  const [sprintId, setSprintId] = useState(() => defaultReportSprint(data, today)?.id ?? "");
  const sprint = sprints.find((s) => s.id === sprintId) ?? sprints[0];
  const report = useMemo(() => (sprint ? buildSprintReport(data, sprint, today) : null), [data, sprint, today]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [allGoals, setAllGoals] = useState(false);

  if (!sprint || !report) return <p className="text-sm text-muted">No sprint has started yet.</p>;
  const r = report;
  const live = r.planned.length - r.dropped.length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sprint" className="w-72 max-w-full">
          <NativeSelect value={sprint.id} onChange={(e) => setSprintId(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatRange(s.startDate, s.endDate)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <span className={cn("mb-1.5 rounded-md px-2 py-1 text-xs font-medium", r.running ? "bg-[var(--reef-bg)] text-[var(--reef-fg)]" : "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]")}>
          {r.running ? `In progress · day ${r.elapsed} of ${r.workdays.length}` : "Ended"}
        </span>
        <div className="ml-auto">
          <Button variant="primary" onClick={() => setEmailOpen(true)}>
            <Mail />
            Draft sprint email
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Done" value={`${r.done.length} / ${live}`} sub={`${pct(r.done.length, live)}% of planned tasks`} />
        <Kpi
          label={r.running ? "Still open" : "Carried over"}
          value={String(r.unfinished.length)}
          sub={`${pct(r.unfinished.length, live)}% of planned${r.blocked.length ? ` · ${r.blocked.length} blocked` : ""}`}
        />
        <Kpi
          label="Within estimate"
          value={r.estimate.measured ? `${pct(r.estimate.within, r.estimate.measured)}%` : "–"}
          sub={r.estimate.ratio !== null ? `Tasks took ${r.estimate.ratio.toFixed(1)}× their estimate on average` : "No finished tasks yet"}
        />
        <Kpi label="On time" value={r.onTime.measured ? `${pct(r.onTime.onTime, r.onTime.measured)}%` : "–"} sub="Finished by the original target" />
        <Kpi label="Check-ins" value={r.checkIns.expected ? `${pct(r.checkIns.actual, r.checkIns.expected)}%` : "–"} sub="Of working days with active tasks" />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Burndown" description={`${formatDays(r.plannedDays)} of estimated work planned; ${formatDays(r.doneDays)} done.`}>
          <BurndownChart points={r.burndown} />
        </Card>
        <Card title="Goal scorecard" description="Each goal's tasks in this sprint.">
          <ul className="flex flex-col divide-y divide-border">
            {(allGoals ? r.goals : r.goals.slice(0, GOALS_SHOWN)).map((g) => {
              const { className, icon: Icon } = HEALTH_STYLE[g.health];
              return (
                <li key={g.goal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link href={`/goals?goal=${g.goal.id}`} className="min-w-0 flex-1 text-[13px] font-medium hover:underline">
                    {g.goal.title}
                  </Link>
                  <span className="flex w-28 items-center gap-2 text-xs tabular-nums text-muted">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct(g.done, g.tasks.length)}%` }} />
                    </span>
                    {g.done}/{g.tasks.length}
                  </span>
                  <span className={cn("inline-flex w-32 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", className)} title={g.reason ?? undefined}>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{goalLabel(g)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {r.goals.length > GOALS_SHOWN && (
            <button onClick={() => setAllGoals((v) => !v)} className="mt-2 text-xs font-medium text-muted underline underline-offset-2 hover:text-text" aria-expanded={allGoals}>
              {allGoals ? "Show fewer goals" : `Show all ${r.goals.length} goals`}
            </button>
          )}
        </Card>
      </div>

      <Card title="By team" description="Planned and done tasks per team. Individual numbers stay private to each person.">
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {r.teams.map((t) => (
            <li key={t.team.id} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 font-medium">{t.team.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct(t.done, t.planned)}%` }} />
              </span>
              <span className="w-16 text-right text-xs tabular-nums text-muted">
                {t.done}/{t.planned}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <RetroBoard report={r} />

      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} report={r} />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mb-3 text-xs text-subtle">{description}</p>}
      {children}
    </section>
  );
}

function EmailDialog({ open, onOpenChange, report }: { open: boolean; onOpenChange: (o: boolean) => void; report: Report }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open && <EmailBody report={report} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function EmailBody({ report, onClose }: { report: Report; onClose: () => void }) {
  const { data, currentUserId } = useData();
  const { person } = useLookups();
  const next = [...data.sprints].sort((a, b) => a.startDate.localeCompare(b.startDate)).find((s) => s.startDate > report.sprint.endDate) ?? null;
  const [text, setText] = useState(() => sprintEmailText(report, data, person.get(currentUserId)?.name ?? "", next));
  const placeholders = (text.match(/\[CONFIRM/g) ?? []).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Email copied", { description: "Paste it into your mail app." });
    } catch {
      toast.error("Couldn't copy. Your browser blocked clipboard access.");
    }
  };

  return (
    <>
      <DialogHeader
        title={`Sprint email · ${report.sprint.name}`}
        description="Written from this sprint's tasks and check-ins. Edit it here, then copy it into your mail app."
      />
      <DialogBody className="flex flex-col gap-2">
        {placeholders > 0 && (
          <p className="rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-fg)]">
            {plural(placeholders, "[CONFIRM] placeholder")} for things the app doesn&apos;t know yet (release dates, PostHog numbers). Fill them in before sending.
          </p>
        )}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={22} aria-label="Sprint email" className="font-mono text-xs leading-relaxed" />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" onClick={copy}>
          <Copy />
          Copy email
        </Button>
      </DialogFooter>
    </>
  );
}
