"use client";

import { Check, ChevronDown, Repeat } from "lucide-react";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareDates, formatRange } from "@/lib/dates";
import { currentSprint, sortedSprints } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Sprint } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn } from "@/lib/utils";

/** Range a sprint covers on Team Today: its start up to its end, but never past today. */
export function sprintRange(s: Sprint, today: string) {
  return { start: s.startDate, end: compareDates(s.endDate, today) > 0 ? today : s.endDate };
}

/** Sprint shortcut next to the date filter. Picking a sprint shows its check-ins so far. */
export function SprintFilter() {
  const { data, today, currentUserId } = useData();
  const { range, setRange, setSprintManagerOpen } = useUI();
  const [open, setOpen] = useState(false);
  const sprints = sortedSprints(data);
  const current = currentSprint(data, today);
  const active = sprints.find((s) => {
    const r = sprintRange(s, today);
    return r.start === range.start && r.end === range.end && compareDates(s.startDate, today) <= 0;
  });
  const me = data.people.find((p) => p.id === currentUserId);
  const managers = data.people.filter((p) => p.canManageSprints).map((p) => p.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" aria-label={`Sprint filter: ${active ? active.name : "no sprint selected"}`}>
          <Repeat />
          <span>{active ? active.name : "Sprint"}</span>
          <ChevronDown className="text-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(21rem,calc(100vw-1.5rem))] p-0">
        <p className="px-4 pb-1.5 pt-3 text-xs font-medium text-subtle">Sprints are fortnights</p>
        <ul role="listbox" aria-label="Sprints" className="max-h-72 overflow-y-auto px-2 pb-2">
          {sprints.map((s) => {
            const upcoming = compareDates(s.startDate, today) > 0;
            const isCurrent = s.id === current?.id;
            const selected = s.id === active?.id;
            return (
              <li key={s.id}>
                <button
                  role="option"
                  aria-selected={selected}
                  disabled={upcoming}
                  onClick={() => {
                    setRange(sprintRange(s, today));
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                    selected && "bg-primary-soft text-primary-soft-fg hover:bg-primary-soft",
                  )}
                >
                  <span className={cn("flex-1 whitespace-nowrap tabular-nums", isCurrent && "font-semibold")}>{formatRange(s.startDate, s.endDate)}</span>
                  <span className="text-xs text-subtle">{isCurrent ? `${s.name} · current` : upcoming ? `${s.name} · upcoming` : s.name}</span>
                  <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          {me?.canManageSprints ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => {
                setOpen(false);
                setSprintManagerOpen(true);
              }}
            >
              <EditPencilIcon />
              Manage sprints
            </Button>
          ) : (
            <p className="text-xs text-subtle">{managers.length ? `Sprint dates are set by ${managers.join(", ")}.` : "Sprint dates are fixed."}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
