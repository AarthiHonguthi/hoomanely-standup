"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CalendarRange,
  ClipboardCheck,
  Menu,
  Moon,
  Plus,
  Sun,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { diffDays, formatRange, formatWeekdayShort } from "@/lib/dates";
import { matchPreset } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { useTheme } from "@/lib/theme";
import { useUI } from "@/lib/ui-state";
import { plural } from "@/lib/utils";
import { Sidebar } from "./sidebar";

export function Header() {
  const { data, today, currentUserId, hydrated } = useData();
  const { range, setCheckInOpen, openTaskForm } = useUI();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const checkedIn = data.checkIns.some(
    (c) => c.personId === currentUserId && c.date === today,
  );
  const preset = matchPreset(range, today);
  const days = diffDays(range.start, range.end) + 1;
  const pageTitle = pathname.startsWith("/goals")
    ? "Goals"
    : pathname.startsWith("/standup")
      ? "Stand-up summary"
      : pathname.startsWith("/sprint-report")
        ? "Sprint report"
        : pathname.startsWith("/feedback")
          ? "Feedback"
          : pathname.startsWith("/me")
            ? "My workspace"
            : "Team Today";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 flex shadow-pop focus:outline-none lg:hidden"
              aria-describedby={undefined}
            >
              <DialogPrimitive.Title className="sr-only">
                Navigation
              </DialogPrimitive.Title>
              <Sidebar
                className="flex h-dvh"
                onNavigate={() => setNavOpen(false)}
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold">{pageTitle}</h1>
          {pathname === "/" && (
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              <CalendarRange className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {preset ? `${preset.label} · ` : ""}
                {range.start === range.end
                  ? formatWeekdayShort(range.start)
                  : formatRange(range.start, range.end)}
                {days > 1 && (
                  <span className="text-subtle">
                    {" "}
                    · {plural(days, "day")}, both included
                  </span>
                )}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => openTaskForm({ mode: "create" })}
            disabled={!hydrated}
            aria-label="Add task"
          >
            <Plus />
            <span className="hidden sm:inline">Add task</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => setCheckInOpen(true)}
            disabled={!hydrated}
          >
            <ClipboardCheck />
            <span className="hidden sm:inline">
              {checkedIn ? "Edit my check-in" : "My check-in"}
            </span>
            <span className="sm:hidden">Check-in</span>
            {!checkedIn && hydrated && (
              <>
                <span
                  className="size-1.5 rounded-full bg-[var(--warning-dot)]"
                  aria-hidden
                />
                <span className="sr-only">(not published today)</span>
              </>
            )}
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
