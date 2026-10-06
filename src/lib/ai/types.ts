import type { Estimate } from "../types";

/**
 * Shared request/response shapes for the assistant. The server route calls
 * Claude when an API key is configured; otherwise the client falls back to
 * the local offline helpers in ./offline.ts, which return the same shapes.
 */

export type AiMode = "claude" | "offline";

export interface TidyInput {
  kind: "task" | "goal";
  title: string;
  notes: string;
  /** Parent goal, for task context. */
  goalTitle?: string;
}

export interface TidyResult {
  title: string;
  notes: string;
}

export interface PlanInput {
  text: string;
  goals: { id: string; title: string }[];
}

export interface PlannedTask {
  title: string;
  estimate: Estimate;
  notes: string;
}

export interface PlanResult {
  goal: { existingGoalId: string | null; title: string; notes: string };
  tasks: PlannedTask[];
  /** One or two sentences explaining the split. */
  summary: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistRequest =
  | { action: "tidy"; input: TidyInput }
  | { action: "plan"; input: PlanInput }
  | { action: "chat"; messages: ChatTurn[]; snapshot: string };

/** Input limits, enforced on the server and mirrored in the UI. */
export const AI_LIMITS = {
  title: 300,
  notes: 4000,
  planText: 4000,
  chatMessage: 4000,
  chatTurns: 24,
  snapshot: 40000,
} as const;
