"use client";

import type { AppData } from "../types";
import { IS_STATIC } from "../site";
import { chatOffline, planOffline, tidyOffline } from "./offline";
import type { AiMode, AssistRequest, ChatTurn, PlanInput, PlanResult, TidyInput, TidyResult } from "./types";

/**
 * Browser-side access to the assistant. Calls /api/assist; when the server
 * reports it is offline (no API key) or can't be reached, falls back to the
 * local offline helpers so every AI button still works in the demo.
 */

export class AssistError extends Error {}

type Outcome<T> = { value: T; mode: AiMode };

async function post(body: AssistRequest): Promise<Response | null> {
  // The static (GitHub Pages) build has no server: use the offline helpers.
  if (IS_STATIC) return null;
  try {
    const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // The server answers {offline: true} when it has no API key.
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const probe = (await res.clone().json()) as { offline?: boolean };
      if (probe.offline) return null;
    }
    return res;
  } catch {
    return null;
  }
}

async function errorFrom(res: Response): Promise<AssistError> {
  try {
    const body = (await res.json()) as { error?: string };
    return new AssistError(body.error ?? "The assistant hit an error.");
  } catch {
    return new AssistError("The assistant hit an error.");
  }
}

let modePromise: Promise<AiMode> | null = null;
export function getAiMode(): Promise<AiMode> {
  if (IS_STATIC) return Promise.resolve("offline");
  modePromise ??= fetch("/api/assist")
    .then((r) => (r.ok ? r.json() : { mode: "offline" }))
    .then((b: { mode?: AiMode }) => (b.mode === "claude" ? "claude" : "offline"))
    .catch(() => "offline" as const);
  return modePromise;
}

export async function tidy(input: TidyInput): Promise<Outcome<TidyResult>> {
  const res = await post({ action: "tidy", input });
  if (!res) return { value: tidyOffline(input), mode: "offline" };
  if (!res.ok) throw await errorFrom(res);
  return { value: ((await res.json()) as { result: TidyResult }).result, mode: "claude" };
}

export async function plan(input: PlanInput): Promise<Outcome<PlanResult>> {
  const res = await post({ action: "plan", input });
  if (!res) return { value: planOffline(input), mode: "offline" };
  if (!res.ok) throw await errorFrom(res);
  return { value: ((await res.json()) as { result: PlanResult }).result, mode: "claude" };
}

/** Streams the reply through onText (called with the full text so far). */
export async function chat(
  messages: ChatTurn[],
  snapshot: string,
  ctx: { data: AppData; today: string; currentUserId: string },
  onText: (textSoFar: string) => void,
): Promise<AiMode> {
  const res = await post({ action: "chat", messages, snapshot });
  if (!res) {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    onText(chatOffline(last, ctx));
    return "offline";
  }
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return "claude";
}
