"use client";

import { CornerDownRight, OctagonAlert } from "lucide-react";
import { useMemo } from "react";
import { Avatar } from "@/components/shared/badges";
import { formatShort } from "@/lib/dates";
import { attentionItems, type AttentionItem } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";
import { cn, firstName } from "@/lib/utils";

/**
 * Current task state (not historical): what is blocked or waiting on
 * someone right now, for the people in the filter.
 */
export function AttentionPanel() {
  const { data } = useData();
  const { personIds } = useUI();
  const items = useMemo(() => attentionItems(data, personIds), [data, personIds]);
  const blocked = items.filter((i) => i.kind === "blocked");
  const support = items.filter((i) => i.kind === "support");

  return (
    <aside className="w-full shrink-0 xl:sticky xl:top-20 xl:w-80" aria-labelledby="attention-heading">
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="border-b border-border px-4 py-3">
          <h2 id="attention-heading" className="text-sm font-semibold">
            Needs attention now
          </h2>
          <p className="mt-0.5 text-xs text-subtle">Current task status, not limited to the dates shown.</p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-subtle">Nothing is blocked or waiting on anyone.</p>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            <Group title="Blocked" items={blocked} kind="blocked" />
            <Group title="Needs support" items={support} kind="support" />
          </div>
        )}
      </div>
    </aside>
  );
}

function Group({ title, items, kind }: { title: string; items: AttentionItem[]; kind: AttentionItem["kind"] }) {
  const { person } = useLookups();
  const { openTask } = useUI();
  if (items.length === 0) return null;
  const Icon = kind === "blocked" ? OctagonAlert : CornerDownRight;
  return (
    <div>
      <p className={cn("flex items-center gap-1.5 px-2 pb-1 pt-2 text-xs font-semibold", kind === "blocked" ? "text-[var(--error-fg)]" : "text-[var(--warning-fg)]")}>
        <Icon className="size-3.5" aria-hidden />
        {title} · {items.length}
      </p>
      <ul>
        {items.map(({ task }) => {
          const owner = person.get(task.ownerId);
          const dep = task.dependency ? person.get(task.dependency.personId) : undefined;
          return (
            <li key={task.id}>
              <button onClick={() => openTask(task.id)} className="flex w-full gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
                {owner && <Avatar person={owner} size="xs" className="mt-0.5" />}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug">{task.title}</span>
                  <span className="mt-0.5 block text-xs text-subtle">
                    {owner ? firstName(owner.name) : "Unknown"}
                    {dep && <> · waiting on {firstName(dep.name)}</>} · target {formatShort(task.targetDate)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
