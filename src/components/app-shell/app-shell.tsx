"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Assistant } from "@/components/ai/assistant";
import { CheckInDialog } from "@/components/checkin/checkin-dialog";
import { EditGoalDialog } from "@/components/goals/edit-goal-dialog";
import { ProfilePhotoDialog } from "./profile-photo-dialog";
import { ManageSprintsDialog } from "@/components/team-today/manage-sprints-dialog";
import { GoalFormDialog } from "@/components/goals/goal-form-dialog";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { DataProvider, useData } from "@/lib/data/store";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { UIProvider } from "@/lib/ui-state";
import { Header } from "./header";
import { PrototypeBanner } from "./prototype-banner";
import { RecoveryBanner } from "./recovery-banner";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <DataProvider>
        <UIProvider>
          <Shell>{children}</Shell>
        </UIProvider>
      </DataProvider>
    </ThemeProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { hydrated } = useData();
  const { theme } = useTheme();
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <PrototypeBanner />
        <RecoveryBanner />
        <main id="main" className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8" tabIndex={-1}>
          {hydrated ? children : <LoadingState />}
        </main>
      </div>
      {hydrated && (
        <>
          <TaskDrawer />
          <TaskFormDialog />
          <GoalFormDialog />
          <EditGoalDialog />
          <ProfilePhotoDialog />
          <ManageSprintsDialog />
          <CheckInDialog />
          <Assistant />
        </>
      )}
      <Toaster theme={theme} position="top-center" toastOptions={{ className: "!rounded-xl !border-border !bg-surface !text-text !shadow-pop" }} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-label="Loading team data">
      <div className="h-10 w-80 max-w-full animate-pulse rounded-lg bg-surface-3" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
