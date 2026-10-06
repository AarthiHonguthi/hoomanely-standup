"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_CURRENT_USER_ID, DEMO_TODAY, USER_STORAGE_KEY } from "../config";
import { nowOn } from "../dates";
import { buildSeedData } from "../mock-data";
import type { AppData, Goal, ResultLink, Sprint, Task } from "../types";
import { goalToneAt } from "../utils";
import * as ops from "./operations";
import { clearData, loadData, saveData } from "./storage";

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

interface DataContextValue {
  data: AppData;
  hydrated: boolean;
  today: string;
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  /** Set when stored data had to be discarded on load. */
  recoveryNotice: string | null;
  dismissRecoveryNotice: () => void;
  persistenceAvailable: boolean;
  createGoal: (input: ops.NewGoal) => ActionResult<Goal>;
  updateGoal: (goalId: string, patch: ops.GoalPatch) => ActionResult;
  saveSprints: (sprints: Sprint[]) => ActionResult;
  setMyAvatar: (avatarUrl: string | null) => ActionResult;
  createTask: (input: ops.NewTask) => ActionResult<Task>;
  createGoalAndTask: (goal: ops.NewGoal, task: Omit<ops.NewTask, "goalId">) => ActionResult<Task>;
  updateTaskDetails: (taskId: string, patch: Partial<ops.TaskDetailsPatch>) => ActionResult;
  changeTaskStatus: (taskId: string, change: ops.StatusChange) => ActionResult;
  addTaskLink: (taskId: string, link: Omit<ResultLink, "id">) => ActionResult;
  removeTaskLink: (taskId: string, linkId: string) => ActionResult;
  publishCheckIn: (input: ops.CheckInInput) => ActionResult<{ wasEdit: boolean }>;
  saveMeetingNotes: (input: ops.MeetingNotesInput) => ActionResult;
  resetMeetingNotes: (date: string) => ActionResult;
  addRetroCard: (input: { sprintId: string; column: "well" | "not_well" | "try"; text: string }) => ActionResult;
  removeRetroCard: (cardId: string) => ActionResult;
  toggleRetroVote: (cardId: string) => ActionResult;
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function readStoredUser(): string | null {
  try {
    return window.localStorage.getItem(USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => buildSeedData());
  const [hydrated, setHydrated] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [currentUserId, setCurrentUserIdState] = useState(DEFAULT_CURRENT_USER_ID);
  // Latest data for synchronous action results without stale closures.
  const dataRef = useRef(data);

  useEffect(() => {
    const result = loadData();
    dataRef.current = result.data;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setData(result.data);
    if (result.status === "recovered") setRecoveryNotice(`${result.reason} The original sample data has been restored.`);
    const storedUser = readStoredUser();
    if (storedUser && result.data.people.some((p) => p.id === storedUser)) setCurrentUserIdState(storedUser);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect storage availability after each save
    setPersistenceAvailable(saveData(data));
  }, [data, hydrated]);

  const ctx = useCallback((): ops.Ctx => ({ actorId: currentUserId, today: DEMO_TODAY, at: nowOn(DEMO_TODAY) }), [currentUserId]);

  const run = useCallback(
    <T,>(fn: (d: AppData) => { data: AppData; value: T }): ActionResult<T> => {
      try {
        const res = fn(dataRef.current);
        dataRef.current = res.data;
        setData(res.data);
        return { ok: true, value: res.value };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
      }
    },
    [],
  );

  const setCurrentUserId = useCallback((id: string) => {
    setCurrentUserIdState(id);
    try {
      window.localStorage.setItem(USER_STORAGE_KEY, id);
    } catch {
      // Preference simply won't persist.
    }
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      hydrated,
      today: DEMO_TODAY,
      currentUserId,
      setCurrentUserId,
      recoveryNotice,
      dismissRecoveryNotice: () => setRecoveryNotice(null),
      persistenceAvailable,
      createGoal: (input) =>
        run((d) => {
          const r = ops.createGoal(d, input, ctx());
          return { data: r.data, value: r.goal };
        }),
      setMyAvatar: (avatarUrl) => run((d) => ({ data: ops.setAvatar(d, currentUserId, avatarUrl, ctx()), value: undefined })),
      saveSprints: (sprints) => run((d) => ({ data: ops.saveSprints(d, sprints, ctx()), value: undefined })),
      updateGoal: (goalId, patch) => run((d) => ({ data: ops.updateGoal(d, goalId, patch, ctx()), value: undefined })),
      createTask: (input) =>
        run((d) => {
          const r = ops.createTask(d, input, ctx());
          return { data: r.data, value: r.task };
        }),
      createGoalAndTask: (goalInput, taskInput) =>
        run((d) => {
          const c = ctx();
          const g = ops.createGoal(d, goalInput, c);
          const t = ops.createTask(g.data, { ...taskInput, goalId: g.goal.id }, c);
          return { data: t.data, value: t.task };
        }),
      updateTaskDetails: (taskId, patch) => run((d) => ({ data: ops.updateTaskDetails(d, taskId, patch, ctx()), value: undefined })),
      changeTaskStatus: (taskId, change) => run((d) => ({ data: ops.changeTaskStatus(d, taskId, change, ctx()), value: undefined })),
      addTaskLink: (taskId, link) => run((d) => ({ data: ops.addTaskLink(d, taskId, link, ctx()), value: undefined })),
      removeTaskLink: (taskId, linkId) => run((d) => ({ data: ops.removeTaskLink(d, taskId, linkId, ctx()), value: undefined })),
      publishCheckIn: (input) =>
        run((d) => {
          const r = ops.publishCheckIn(d, input, ctx());
          return { data: r.data, value: { wasEdit: r.wasEdit } };
        }),
      saveMeetingNotes: (input) => run((d) => ({ data: ops.saveMeetingNotes(d, input, ctx()), value: undefined })),
      resetMeetingNotes: (date) => run((d) => ({ data: ops.resetMeetingNotes(d, date), value: undefined })),
      addRetroCard: (input) => run((d) => ({ data: ops.addRetroCard(d, input, ctx()), value: undefined })),
      removeRetroCard: (cardId) => run((d) => ({ data: ops.removeRetroCard(d, cardId, ctx()), value: undefined })),
      toggleRetroVote: (cardId) => run((d) => ({ data: ops.toggleRetroVote(d, cardId, ctx()), value: undefined })),
      resetDemoData: () => {
        clearData();
        const seed = buildSeedData();
        dataRef.current = seed;
        setData(seed);
        setRecoveryNotice(null);
      },
    }),
    [data, hydrated, currentUserId, setCurrentUserId, recoveryNotice, persistenceAvailable, run, ctx],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const v = useContext(DataContext);
  if (!v) throw new Error("useData must be used inside DataProvider");
  return v;
}

/** Convenience lookups derived from the current data. */
export function useLookups() {
  const { data } = useData();
  return useMemo(
    () => ({
      person: new Map(data.people.map((p) => [p.id, p])),
      team: new Map(data.teams.map((t) => [t.id, t])),
      goal: new Map(data.goals.map((g) => [g.id, g])),
      goalTone: (goalId: string) => goalToneAt(data.goals.findIndex((g) => g.id === goalId)),
      task: new Map(data.tasks.map((t) => [t.id, t])),
      sprint: new Map(data.sprints.map((s) => [s.id, s])),
    }),
    [data],
  );
}
