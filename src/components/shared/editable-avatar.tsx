"use client";

import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import { useUI } from "@/lib/ui-state";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./badges";

/** The signed-in person's avatar as a button that opens the profile photo dialog. */
export function EditableAvatar({ person, size = "lg", className }: { person: Person; size?: "sm" | "lg"; className?: string }) {
  const { setProfilePhotoOpen } = useUI();
  return (
    <button
      type="button"
      onClick={() => setProfilePhotoOpen(true)}
      className={cn("group/avatar relative shrink-0 rounded-full", className)}
      aria-label="Change your profile photo"
      title="Change your profile photo"
    >
      <Avatar person={person} size={size} className={size === "lg" ? "ring-1 ring-border-strong" : undefined} />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100" aria-hidden>
        <EditPencilIcon className={size === "lg" ? "size-4" : "size-3"} />
      </span>
    </button>
  );
}
