"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronDown, Plus } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { GoalDot } from "@/components/shared/badges";
import { Input } from "@/components/ui/input";
import { useLookups } from "@/lib/data/store";
import type { Goal } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Orders goals for a search. Titles starting with the query come first, then titles
 * with a word starting with it, then any other match. Each group is alphabetical.
 * With no query, goals keep their usual order.
 */
export function rankGoals(goals: Goal[], query: string): Goal[] {
  const q = query.trim().toLowerCase();
  if (!q) return goals;
  const rank = (title: string) => {
    const t = title.toLowerCase();
    if (t.startsWith(q)) return 0;
    if (t.split(/[\s:&,()/-]+/).some((w) => w.startsWith(q))) return 1;
    return t.includes(q) ? 2 : -1;
  };
  return goals
    .map((g) => ({ g, r: rank(g.title) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.g.title.localeCompare(b.g.title, undefined, { sensitivity: "base" }))
    .map((x) => x.g);
}

/** Bolds the matched part of a title. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  // Prefer a match at the start of a word, like the ranking does.
  const wordStart = q ? lower.search(new RegExp(`(^|[\\s:&,()/-])${ql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)) : -1;
  const i = wordStart < 0 ? (q ? lower.indexOf(ql) : -1) : wordStart === 0 && lower.startsWith(ql) ? 0 : wordStart + 1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-semibold">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Type-to-search goal picker. Receives id / aria-* from Field for its label and errors.
 * `newValue` is the value used for "Create a new goal"; the typed text is passed along.
 */
export function GoalCombobox({
  goals,
  value,
  newValue,
  onChange,
  ...aria
}: {
  goals: Goal[];
  value: string;
  newValue: string;
  onChange: (value: string, typed: string) => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { goalTone } = useLookups();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedTitle = value === newValue ? "" : (goals.find((g) => g.id === value)?.title ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = not searching, show the selected title
  const [active, setActive] = useState(0);

  const results = useMemo(() => rankGoals(goals, query ?? ""), [goals, query]);
  // Options: matching goals, then "Create a new goal".
  const options = [...results.map((g) => g.id), newValue];

  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const choose = (id: string) => {
    onChange(id, id === newValue ? (query ?? "").trim() : "");
    close();
  };
  const show = (q: string | null) => {
    setQuery(q);
    setActive(0);
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show(query);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault(); // don't submit the form
      choose(options[active]);
    } else if (e.key === "Tab" && open) {
      close();
    }
  };

  const activeId = open ? `${listId}-${active}` : undefined;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(o) => (o ? show(query) : close())}>
      <PopoverPrimitive.Anchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            {...aria}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            value={query ?? selectedTitle}
            placeholder={value === newValue ? "Creating a new goal below" : "Type to search goals"}
            onChange={(e) => show(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onClick={() => !open && show(null)}
            onKeyDown={onKeyDown}
            className="pr-9"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Close goal list" : "Show all goals"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) close();
              else show(null);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-subtle hover:text-text"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (inputRef.current?.parentElement?.contains(e.target as Node)) e.preventDefault();
          }}
          className="z-50 w-(--radix-popover-trigger-width) rounded-xl border border-border bg-surface p-1 shadow-pop animate-pop-in"
        >
          <ul id={listId} role="listbox" aria-label="Goals" className="max-h-72 overflow-y-auto">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-subtle">No goals match “{query}”.</li>}
            {options.map((id, i) => {
              const g = results[i];
              const isNew = id === newValue;
              return (
                <li
                  key={id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(id)}
                  ref={(el) => {
                    if (el && i === active) el.scrollIntoView({ block: "nearest" });
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    i === active && "bg-surface-2",
                    isNew && "mt-1 border-t border-border font-medium text-primary-soft-fg",
                    id === value && !isNew && "font-medium",
                  )}
                >
                  {isNew ? (
                    <>
                      <Plus className="size-4 shrink-0" aria-hidden />
                      {query?.trim() ? `Create a new goal “${query.trim()}”` : "Create a new goal…"}
                    </>
                  ) : (
                    <>
                      <GoalDot tone={goalTone(g.id)} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <Highlight text={g.title} query={query ?? ""} />
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
