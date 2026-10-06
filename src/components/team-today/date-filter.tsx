"use client";

import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { diffDays, formatRange, formatShort } from "@/lib/dates";
import { DATE_PRESETS, matchPreset, presetRange, validateRange } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";
import { cn, plural } from "@/lib/utils";

const PRESET_LONG_LABELS: Record<string, string> = {
  today: "Today",
  "1": "Yesterday through today",
};

export function DateFilter() {
  const { today } = useData();
  const { range, setRange } = useUI();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const [touched, setTouched] = useState(false);

  const preset = matchPreset(range, today);
  const error = touched ? validateRange(start, end) : null;
  const days = diffDays(range.start, range.end) + 1;

  const onOpenChange = (next: boolean) => {
    if (next) {
      setStart(range.start);
      setEnd(range.end);
      setTouched(false);
    }
    setOpen(next);
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateRange(start, end)) return;
    setRange({ start, end });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="secondary" aria-label={`Date range: ${formatRange(range.start, range.end)}, ${plural(days, "day")}, both dates included`}>
          <CalendarDays />
          <span>{preset ? preset.label : formatRange(range.start, range.end)}</span>
          <ChevronDown className="text-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(25rem,calc(100vw-1.5rem))] p-0">
        <div className="p-2">
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-subtle">Quick ranges · today is {formatShort(today)}</p>
          <ul role="listbox" aria-label="Quick date ranges">
            {DATE_PRESETS.map((p) => {
              const r = presetRange(p.daysBack, today);
              const active = preset?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setRange(r);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                      active && "bg-primary-soft text-primary-soft-fg hover:bg-primary-soft",
                    )}
                  >
                    <span className="flex-1">{PRESET_LONG_LABELS[p.id]}</span>
                    <span className={cn("text-xs tabular-nums", active ? "text-primary-soft-fg" : "text-subtle")}>{formatRange(r.start, r.end)}</span>
                    <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <form onSubmit={applyCustom} className="border-t border-border p-4" noValidate>
          <p className="mb-3 text-xs font-medium text-subtle">Custom range</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End date">
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <p className={cn("mt-2 text-xs", error ? "font-medium text-[var(--error-fg)]" : "text-subtle")} role={error ? "alert" : undefined}>
            {error ?? "Both the start and end dates are included."}
          </p>
          <div className="mt-3 flex justify-end">
            <Button type="submit" variant="primary" size="sm">
              Apply range
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
