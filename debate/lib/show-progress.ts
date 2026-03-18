import type { DashboardSnapshot, RuntimeStatus } from "@/lib/types";

export interface ShowStage {
  id:
    | "opening_brief"
    | "signal_sweep"
    | "evidence_merge"
    | "chaos_time"
    | "human_review"
    | "final_call";
  label: string;
  slot: string;
  startSeq: number;
  endSeq: number;
}

export interface ShowProgressState {
  stages: ShowStage[];
  currentStageIndex: number;
  currentStage: ShowStage;
}

const BASE_STAGE_PLAN: Omit<ShowStage, "endSeq">[] = [
  { id: "opening_brief", label: "Opening Brief", slot: "0-3m", startSeq: 1 },
  { id: "signal_sweep", label: "Signal Sweep", slot: "3-7m", startSeq: 3 },
  { id: "evidence_merge", label: "Evidence Merge", slot: "7-11m", startSeq: 8 },
  { id: "chaos_time", label: "Chaos Time", slot: "11-15m", startSeq: 11 },
  { id: "human_review", label: "Human Review", slot: "15-18m", startSeq: 15 },
  { id: "final_call", label: "Final Call", slot: "18-20m", startSeq: 22 }
];

export function getShowStages(totalEvents: number): ShowStage[] {
  return BASE_STAGE_PLAN.map((stage, index) => ({
    ...stage,
    endSeq: BASE_STAGE_PLAN[index + 1]
      ? BASE_STAGE_PLAN[index + 1].startSeq - 1
      : Math.max(totalEvents, stage.startSeq)
  }));
}

function resolveStageIndex(
  stages: ShowStage[],
  cursor: number,
  runtimeStatus: RuntimeStatus,
  snapshot: DashboardSnapshot
) {
  if (
    snapshot.latestDecision ||
    snapshot.currentPhase === "final_decision" ||
    runtimeStatus.state === "complete"
  ) {
    return stages.findIndex((stage) => stage.id === "final_call");
  }

  if (
    snapshot.pendingInterrupt ||
    runtimeStatus.state === "waiting_for_interrupt" ||
    snapshot.currentPhase === "interrupt"
  ) {
    return stages.findIndex((stage) => stage.id === "human_review");
  }

  if (snapshot.currentPhase === "chaos_time") {
    return stages.findIndex((stage) => stage.id === "chaos_time");
  }

  const bySeq = stages.findIndex(
    (stage) => cursor >= stage.startSeq && cursor <= stage.endSeq
  );

  return bySeq >= 0 ? bySeq : 0;
}

export function deriveShowProgressState({
  cursor,
  totalEvents,
  runtimeStatus,
  snapshot
}: {
  cursor: number;
  totalEvents: number;
  runtimeStatus: RuntimeStatus;
  snapshot: DashboardSnapshot;
}): ShowProgressState {
  const stages = getShowStages(totalEvents);
  const currentStageIndex = Math.max(
    0,
    resolveStageIndex(stages, cursor, runtimeStatus, snapshot)
  );

  return {
    stages,
    currentStageIndex,
    currentStage: stages[currentStageIndex] ?? stages[0]
  };
}
