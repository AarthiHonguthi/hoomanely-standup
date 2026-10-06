"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/data/operations";
import type { FieldErrors, LinkDraft } from "@/lib/validation";

/**
 * Editable list of named links for task and goal forms: a "+ Add link" button,
 * then a name + URL row per link. Errors come from validateLinks (keyed
 * "<prefix>links.<index>").
 */
export function LinksField({
  links,
  onChange,
  errors,
  prefix = "",
}: {
  links: LinkDraft[];
  onChange: (links: LinkDraft[]) => void;
  errors: FieldErrors;
  prefix?: string;
}) {
  const update = (i: number, patch: Partial<LinkDraft>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-text">
        Links <span className="font-normal text-subtle">(optional)</span>
      </legend>
      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((l, i) => {
            const err = errors[`${prefix}links.${i}`];
            return (
              <li key={l.id}>
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2">
                  <Input value={l.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Name, e.g. Figma" aria-label={`Link ${i + 1} name`} maxLength={80} />
                  <Input
                    value={l.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                    placeholder="https://"
                    inputMode="url"
                    aria-label={`Link ${i + 1} URL`}
                    aria-invalid={err ? true : undefined}
                  />
                  <Button variant="ghost" size="icon-sm" className="size-9" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>
                    <X />
                  </Button>
                </div>
                {err && <p className="mt-1 text-xs font-medium text-[var(--error-fg)]">{err}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" size="sm" className="self-start" onClick={() => onChange([...links, { id: newId("l"), label: "", url: "" }])}>
        <Plus />
        Add link
      </Button>
      <p className="text-xs text-subtle">Shown as clickable links on cards. Leave the name empty to use the site name.</p>
    </fieldset>
  );
}
