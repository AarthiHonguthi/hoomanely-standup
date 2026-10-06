"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useData } from "@/lib/data/store";
import type { Task } from "@/lib/types";
import { validateUrl } from "@/lib/validation";

export function LinksEditor({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const { addTaskLink, removeTaskLink } = useData();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateUrl(url);
    setError(err);
    if (err) return;
    const res = addTaskLink(task.id, { label, url });
    if (!res.ok) return void toast.error(res.error);
    setLabel("");
    setUrl("");
    setAdding(false);
    toast.success("Link added");
  };

  return (
    <div className="flex flex-col gap-2">
      {task.links.length === 0 && !adding && <p className="text-sm text-subtle">No result or document links yet.</p>}
      {task.links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {task.links.map((l) => (
            <li key={l.id} className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <ExternalLink className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-sm font-medium text-primary-soft-fg hover:underline">
                {l.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="hidden max-w-48 truncate text-xs text-subtle sm:inline">{safeHost(l.url)}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label={`Remove link ${l.label}`}
                  onClick={() => {
                    const res = removeTaskLink(task.id, l.id);
                    if (!res.ok) toast.error(res.error);
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (adding ? (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <Field label="Label" optional>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Test report" maxLength={80} />
              </Field>
              <Field label="URL" error={error}>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" autoFocus />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setError(null); }}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Add link
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
            <Plus />
            Add result link
          </Button>
        ))}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
