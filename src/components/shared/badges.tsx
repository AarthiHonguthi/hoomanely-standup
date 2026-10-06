import { ArrowRightFromLine, Ban, Circle, CircleCheck, CircleDot, Handshake, OctagonAlert } from "lucide-react";
import Image from "next/image";
import type { ComponentType } from "react";
import { ESTIMATE_LABELS, STATUS_LABELS } from "@/lib/config";
import type { AccentColor, Estimate, Person, TaskStatus } from "@/lib/types";
import { asset } from "@/lib/site";
import { cn, initials } from "@/lib/utils";

type Tone = AccentColor | "error" | "success" | "warning" | "neutral";

export const toneClasses: Record<Tone, string> = {
  plasma: "bg-[var(--plasma-bg)] text-[var(--plasma-fg)]",
  reef: "bg-[var(--reef-bg)] text-[var(--reef-fg)]",
  gold: "bg-[var(--gold-bg)] text-[var(--gold-fg)]",
  carbon: "bg-[var(--carbon-bg)] text-[var(--carbon-fg)]",
  moss: "bg-[var(--moss-bg)] text-[var(--moss-fg)]",
  error: "bg-[var(--error-bg)] text-[var(--error-fg)]",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]",
};

export const dotClasses: Record<Tone, string> = {
  plasma: "bg-[var(--plasma-dot)]",
  reef: "bg-[var(--reef-dot)]",
  gold: "bg-[var(--gold-dot)]",
  carbon: "bg-[var(--carbon-dot)]",
  moss: "bg-[var(--moss-dot)]",
  error: "bg-[var(--error-dot)]",
  success: "bg-[var(--success-dot)]",
  warning: "bg-[var(--warning-dot)]",
  neutral: "bg-[var(--neutral-dot)]",
};

const STATUS_META: Record<TaskStatus, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  not_started: { tone: "carbon", icon: Circle },
  in_progress: { tone: "reef", icon: CircleDot },
  blocked: { tone: "error", icon: OctagonAlert },
  done: { tone: "success", icon: CircleCheck },
  carried_over: { tone: "gold", icon: ArrowRightFromLine },
  dropped: { tone: "neutral", icon: Ban },
};

/** Colour family used for a status everywhere (badges, timeline bars). */
export function statusTone(status: TaskStatus): Tone {
  return STATUS_META[status].tone;
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { tone, icon: Icon } = STATUS_META[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium", toneClasses[tone], className)}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function EstimateChip({ estimate, className }: { estimate: Estimate; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center rounded-md border border-border px-1.5 text-xs font-medium tabular-nums text-muted", className)}
      title={`Estimated effort: ${ESTIMATE_LABELS[estimate]}`}
    >
      {estimate}d<span className="sr-only"> estimated</span>
    </span>
  );
}

/** "Needs input from X" — a dependency that does not (yet) block the task. */
export function SupportBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium", toneClasses.warning, className)}>
      <Handshake className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

const avatarSizes = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm", xl: "size-24 text-2xl" } as const;
const avatarPixels = { xs: 20, sm: 28, md: 36, lg: 44, xl: 96 } as const;

/** Profile photo when the person has one, otherwise their initials on their accent colour. */
export function Avatar({ person, size = "md", className }: { person: Person; size?: keyof typeof avatarSizes; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold", toneClasses[person.accent], avatarSizes[size], className)}
    >
      {person.avatarUrl ? (
        <Image
          src={asset(person.avatarUrl)}
          alt=""
          width={avatarPixels[size] * 2}
          height={avatarPixels[size] * 2}
          unoptimized={person.avatarUrl.startsWith("data:")}
          className="size-full object-cover"
        />
      ) : (
        initials(person.name)
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 5 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5" aria-label={`Contributors: ${people.map((p) => p.name).join(", ")}`} role="img">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size="sm" className="ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted ring-2 ring-surface">+{rest}</span>
      )}
    </span>
  );
}

export function GoalDot({ tone, className }: { tone: AccentColor; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", dotClasses[tone], className)} aria-hidden />;
}

export function GoalLabel({ tone, title, className }: { tone: AccentColor; title: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted", className)}>
      <GoalDot tone={tone} />
      <span className="truncate">{title}</span>
    </span>
  );
}

const PRIORITY_STYLE = [
  "bg-[var(--error-bg)] text-[var(--error-fg)]",
  "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  "bg-[var(--reef-bg)] text-[var(--reef-fg)]",
  "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]",
] as const;
export const PRIORITY_HINT = ["Do first", "High", "Normal", "Low"] as const;

/** "P0"–"P3" chip. The label carries the meaning; colour only reinforces it. */
export function PriorityBadge({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-xs font-semibold", PRIORITY_STYLE[level], className)} title={`P${level}: ${PRIORITY_HINT[level]}`}>
      P{level}
    </span>
  );
}
