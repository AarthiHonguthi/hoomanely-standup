"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEMO_TODAY } from "./config";
import { presetRange, type DateRange } from "./data/selectors";

/**
 * Transient UI state shared across pages: Team Today filters and which
 * drawer/dialog is open. Not persisted.
 */

/** `startDate` pre-fills the start and target dates (e.g. from a calendar day). */
export type TaskFormState = { mode: "create"; goalId?: string; startDate?: string } | { mode: "edit"; taskId: string };

interface UIContextValue {
  range: DateRange;
  setRange: (r: DateRange) => void;
  personIds: string[];
  setPersonIds: (ids: string[]) => void;
  resetFilters: () => void;

  openTaskId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;

  taskForm: TaskFormState | null;
  openTaskForm: (s: TaskFormState) => void;
  closeTaskForm: () => void;

  goalFormOpen: boolean;
  setGoalFormOpen: (open: boolean) => void;

  /** Goal being edited in the edit-goal dialog. */
  editGoalId: string | null;
  setEditGoalId: (id: string | null) => void;

  checkInOpen: boolean;
  setCheckInOpen: (open: boolean) => void;

  sprintManagerOpen: boolean;
  setSprintManagerOpen: (open: boolean) => void;

  profilePhotoOpen: boolean;
  setProfilePhotoOpen: (open: boolean) => void;

  assistant: AssistantState;
  openAssistant: (opts?: { draft?: string; plan?: boolean }) => void;
  closeAssistant: () => void;
}

/** The AI assistant panel. `draft` pre-fills the composer; `plan` starts in plan mode. */
export interface AssistantState {
  open: boolean;
  draft: string;
  plan: boolean;
  /** Increments on every open request so the panel can react to a new draft. */
  nonce: number;
}

const UIContext = createContext<UIContextValue | null>(null);

export const DEFAULT_RANGE = presetRange(0, DEMO_TODAY);

export function UIProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [sprintManagerOpen, setSprintManagerOpen] = useState(false);
  const [profilePhotoOpen, setProfilePhotoOpen] = useState(false);
  const [assistant, setAssistant] = useState<AssistantState>({ open: false, draft: "", plan: false, nonce: 0 });

  const value = useMemo<UIContextValue>(
    () => ({
      range,
      setRange,
      personIds,
      setPersonIds,
      resetFilters: () => {
        setRange(DEFAULT_RANGE);
        setPersonIds([]);
      },
      openTaskId,
      openTask: setOpenTaskId,
      closeTask: () => setOpenTaskId(null),
      taskForm,
      openTaskForm: setTaskForm,
      closeTaskForm: () => setTaskForm(null),
      goalFormOpen,
      setGoalFormOpen,
      editGoalId,
      setEditGoalId,
      checkInOpen,
      setCheckInOpen,
      sprintManagerOpen,
      setSprintManagerOpen,
      profilePhotoOpen,
      setProfilePhotoOpen,
      assistant,
      openAssistant: (opts) => setAssistant((a) => ({ open: true, draft: opts?.draft ?? "", plan: opts?.plan ?? false, nonce: a.nonce + 1 })),
      closeAssistant: () => setAssistant((a) => ({ ...a, open: false })),
    }),
    [range, personIds, openTaskId, taskForm, goalFormOpen, editGoalId, checkInOpen, sprintManagerOpen, profilePhotoOpen, assistant],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI must be used inside UIProvider");
  return v;
}
