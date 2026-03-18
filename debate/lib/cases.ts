import philosophyEvents from "@/data/philosophy-r1.json";
import case01Events from "@/data/case01-r1.json";
import case02Events from "@/data/case02-r1.json";
import case03Events from "@/data/case03-r1.json";
import case04Events from "@/data/case04-r1.json";
import type { DashboardEvent } from "@/lib/types";

export interface CaseSummary {
  roundId: string;
  label: string;
  title: string;
  summary: string;
  recommendedAction: "approve" | "reject" | "hold" | "mitigate";
}

export const DEFAULT_ROUND_ID = "philosophy-r1";

export const CASE_LIST: CaseSummary[] = [
  {
    roundId: "philosophy-r1",
    label: "PHIL01",
    title: "트롤리 문제 / 윤리적 딜레마",
    summary: "폭주하는 열차 앞 5명과 1명 — 실존주의, 공리주의, 덕 윤리, 회의론, 실용주의 관점에서 자유 토론",
    recommendedAction: "hold"
  },
  {
    roundId: "case01-r1",
    label: "CASE01",
    title: "열 급등 / 보정 대기",
    summary: "센서 교체 직후 열 급등이 감지됐지만 단위 메타데이터와 보정 상태가 불안정한 시나리오",
    recommendedAction: "mitigate"
  },
  {
    roundId: "case02-r1",
    label: "CASE02",
    title: "전압 이상 / 프로브 신뢰도 붕괴",
    summary: "전압 이상 경보가 들어왔지만 probe 신뢰도와 threshold drift 때문에 증거 강도가 무너지는 시나리오",
    recommendedAction: "reject"
  },
  {
    roundId: "case03-r1",
    label: "CASE03",
    title: "중복 프로브 합의 / 셧다운 승인",
    summary: "중복 probe와 냉각 telemetry가 모두 같은 방향으로 합의해 shutdown 승인까지 가는 시나리오",
    recommendedAction: "approve"
  },
  {
    roundId: "case04-r1",
    label: "CASE04",
    title: "단위 누락 압력 프로브 / 보류 구간",
    summary: "압력 이상은 보이지만 단위 메타데이터와 교체 직후 보정 상태가 정리되지 않아 hold가 권장되는 시나리오",
    recommendedAction: "hold"
  }
];

export const CASES: Record<string, DashboardEvent[]> = {
  "philosophy-r1": philosophyEvents as DashboardEvent[],
  "case01-r1": case01Events as DashboardEvent[],
  "case02-r1": case02Events as DashboardEvent[],
  "case03-r1": case03Events as DashboardEvent[],
  "case04-r1": case04Events as DashboardEvent[]
};

export function getCaseEvents(roundId: string): DashboardEvent[] {
  return CASES[roundId] ?? [];
}

export function getCaseSummary(roundId: string): CaseSummary | null {
  return CASE_LIST.find((entry) => entry.roundId === roundId) ?? null;
}

export function resolveRoundId(roundId?: string | null): string {
  return roundId && CASES[roundId] ? roundId : DEFAULT_ROUND_ID;
}
