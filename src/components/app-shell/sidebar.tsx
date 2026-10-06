"use client";

import { ChartNoAxesColumn, Check, ChevronsUpDown, CircleUserRound, LayoutDashboard, MessageSquareHeart, NotebookText, RotateCcw, Target } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/badges";
import { EditableAvatar } from "@/components/shared/editable-avatar";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WORKSPACE_NAME } from "@/lib/config";
import { sortPeople } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";
import { asset } from "@/lib/site";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Team Today", icon: LayoutDashboard },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/standup", label: "Stand-up summary", icon: NotebookText },
  // Manager only: shown to people who manage sprints.
  { href: "/sprint-report", label: "Sprint report", icon: ChartNoAxesColumn, managerOnly: true },
  { href: "/me", label: "My workspace", icon: CircleUserRound },
  { href: "/feedback", label: "Feedback", icon: MessageSquareHeart },
];

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, currentUserId } = useData();
  const isManager = Boolean(data.people.find((p) => p.id === currentUserId)?.canManageSprints);
  return (
    <aside
      className={cn("sticky top-0 h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4", className)}
      aria-label="Main navigation"
    >
      <div className="px-2 pb-5 pt-1">
        {/* Black wordmark on transparent; inverted to white in dark mode. */}
        <Image src={asset("/hoomanely-wordmark.png")} alt={WORKSPACE_NAME} width={2349} height={430} loading="eager" className="h-6 w-auto dark:invert" />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.filter((item) => !item.managerOnly || isManager).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <ResetDemoButton />
        <UserSwitcher />
      </div>
    </aside>
  );
}

function UserSwitcher() {
  const { data, currentUserId, setCurrentUserId } = useData();
  const { closeTask } = useUI();
  const [open, setOpen] = useState(false);
  const me = data.people.find((p) => p.id === currentUserId);
  if (!me) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Avatar edits your photo; the rest of the card switches the demo user. */}
      <div className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2 transition-colors hover:border-border-strong">
        <EditableAvatar person={me} size="sm" />
        <PopoverTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left" aria-label={`Signed in as ${me.name} (simulated). Switch demo user`}>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-[11px] text-subtle">Signed in · simulated</span>
          </span>
          <ChevronsUpDown className="size-4 text-subtle" aria-hidden />
        </PopoverTrigger>
      </div>
      <PopoverContent side="top" align="start" className="w-64">
        <p className="px-2 pb-1.5 pt-1 text-xs text-subtle">View the demo as another teammate. You can only edit your own tasks and check-ins.</p>
        <ul role="listbox" aria-label="Demo user">
          {sortPeople(data.people).map((p) => (
            <li key={p.id}>
              <button
                role="option"
                aria-selected={p.id === currentUserId}
                onClick={() => {
                  setCurrentUserId(p.id);
                  closeTask();
                  setOpen(false);
                  toast(`Now viewing as ${p.name}`);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <Avatar person={p} size="xs" />
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === currentUserId && <Check className="size-4 text-primary-soft-fg" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ResetDemoButton() {
  const { resetDemoData } = useData();
  const { resetFilters, closeTask } = useUI();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-2 hover:text-text"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Reset demo data
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset demo data?"
        description="This discards every goal, task and check-in change made in this browser and restores the original sample data. Your light/dark preference is kept."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={() => {
          closeTask();
          resetDemoData();
          resetFilters();
          toast.success("Demo data restored");
        }}
      />
    </>
  );
}
