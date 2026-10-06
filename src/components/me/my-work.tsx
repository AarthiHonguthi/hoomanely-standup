"use client";

import { EditableAvatar } from "@/components/shared/editable-avatar";
import { compareDates, diffDays } from "@/lib/dates";
import { useData, useLookups } from "@/lib/data/store";
import type { TaskStatus } from "@/lib/types";
import { plural } from "@/lib/utils";
import { useState } from "react";
import { MyPace } from "./my-pace";
import { TaskCalendar } from "./task-calendar";

const OPEN: TaskStatus[] = ["not_started", "in_progress", "blocked"];

/** One person's own view: a short summary and a calendar of their tasks. Tasks are added and edited from the day panel. */
export function MyWork() {
  const { data, today, currentUserId } = useData();
  const [selected, setSelected] = useState(today);
  const { person, team } = useLookups();
  const me = person.get(currentUserId);
  if (!me) return null;

  const open = data.tasks.filter((t) => t.ownerId === currentUserId && OPEN.includes(t.status));
  const late = open.filter((t) => compareDates(t.targetDate, today) < 0).length;
  const dueThisWeek = open.filter((t) => diffDays(today, t.targetDate) >= 0 && diffDays(today, t.targetDate) <= 6).length;
  const blocked = open.filter((t) => t.status === "blocked").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <EditableAvatar person={me} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{me.name}&apos;s workspace</h2>
          <p className="text-sm text-muted">
            {team.get(me.teamId)?.name} · {plural(open.length, "open task")}
            {blocked > 0 && <span className="text-[var(--error-fg)]"> · {blocked} blocked</span>}
            {late > 0 && <span className="text-[var(--error-fg)]"> · {late} past target</span>}
            {dueThisWeek > 0 && <> · {dueThisWeek} due in the next 7 days</>}
          </p>
        </div>
      </div>

      <TaskCalendar personId={currentUserId} selected={selected} onSelect={setSelected} />
      <MyPace personId={currentUserId} date={selected} />
    </div>
  );
}
