import { Suspense } from "react";
import { GoalsView } from "@/components/goals/goals-view";

export default function GoalsPage() {
  return (
    <Suspense fallback={null}>
      <GoalsView />
    </Suspense>
  );
}
