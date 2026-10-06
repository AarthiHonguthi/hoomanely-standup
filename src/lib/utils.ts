import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AccentColor } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const GOAL_TONES: AccentColor[] = ["plasma", "reef", "gold", "moss", "carbon"];

/** Accent for a goal from its position in the goal list, so goals don't share a colour until there are many. */
export function goalToneAt(index: number): AccentColor {
  return GOAL_TONES[Math.max(0, index) % GOAL_TONES.length];
}
