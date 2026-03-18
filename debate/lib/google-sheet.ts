/**
 * Google Sheets 연동 — JTBC 할루시네이션 현장 기록지
 *
 * Google Form 컬럼 규격:
 *   A: 타임스탬프
 *   B: 출연진 (하석진, 황제성, 츠키, 곽재식, 허성범, 가온)
 *   C: 현장 (대기실, 문제1~7, 기타)
 *   D: 평가 항목 (성과기여도, 역량평가, 협업태도, 위기대응력, 인간의직관력, 윤리적책임감, AI검증력)
 *   E: 행동 태그 (정답, 오답, 분석적접근, 리더십, 흔들림, 창의적발상, 도발반응, 협력, 포기, 반전)
 *   F: 상세 설명
 */

/** 행동 태그 종류 */
export const BEHAVIOR_TAGS = [
  "정답", "오답", "분석적접근", "직관적판단",
  "리더십", "흔들림", "창의적발상", "윤리적판단",
  "도발반응", "협력", "포기", "반전", "기타"
] as const;

/** 7대 평가 항목 */
export const EVAL_DIMENSION_KEYS = [
  "성과 기여도", "역량 평가", "협업 태도", "위기 대응력",
  "인간의 직관력", "윤리적 책임감", "AI 검증력"
] as const;

export type BehaviorTag = (typeof BEHAVIOR_TAGS)[number];

/** Google Form에서 들어오는 한 행 = 하나의 관찰 기록 */
export interface ObservationRow {
  timestamp: string;
  participantName: string;  // 출연진
  scene: string;            // 현장 (대기실, 문제1~7)
  evalDimension: string;    // 평가 항목 (7대 지표 중 하나)
  tags: BehaviorTag[];      // 행동 태그
  description: string;      // 상세 설명
}

/** 참가자별 관찰 기록 요약 */
export interface ParticipantObservations {
  name: string;
  observations: ObservationRow[];
  tagCounts: Record<string, number>;
  evalDimensionCounts: Record<string, { positive: number; negative: number; total: number }>;
  totalCount: number;
  /** AI 추천 등급 (행동 태그 기반 자동 산출) */
  recommendedGrade: string;
}

/* ── 관찰 기록지 파싱 ── */

function parseTags(raw: string): BehaviorTag[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;，、]/)
    .map((t) => t.trim())
    .filter((t): t is BehaviorTag => BEHAVIOR_TAGS.includes(t as BehaviorTag));
}

export function parseObservationRows(csv: string): ObservationRow[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  // 컬럼: A=타임스탬프, B=출연진, C=현장, D=평가항목, E=행동 태그, F=상세 설명
  return rows.slice(1).map((cols) => ({
    timestamp: cols[0] ?? "",
    participantName: (cols[1] ?? "").trim(),
    scene: (cols[2] ?? "").trim(),
    evalDimension: (cols[3] ?? "").trim(),
    tags: parseTags(cols[4] ?? ""),
    description: (cols[5] ?? "").trim()
  }));
}

const POSITIVE_TAGS = new Set(["정답", "분석적접근", "리더십", "창의적발상", "협력", "반전", "윤리적판단", "직관적판단"]);
const NEGATIVE_TAGS = new Set(["오답", "흔들림", "도발반응", "포기"]);

function computeRecommendedGrade(tagCounts: Record<string, number>): string {
  let positive = 0, negative = 0;
  for (const [tag, count] of Object.entries(tagCounts)) {
    if (POSITIVE_TAGS.has(tag)) positive += count;
    if (NEGATIVE_TAGS.has(tag)) negative += count;
  }
  const total = positive + negative;
  if (total === 0) return "C"; // no data
  const ratio = positive / total;
  if (ratio >= 0.9) return "S";
  if (ratio >= 0.75) return "A";
  if (ratio >= 0.6) return "B";
  if (ratio >= 0.4) return "C";
  if (ratio >= 0.2) return "D";
  return "F";
}

export function summarizeObservations(rows: ObservationRow[]): ParticipantObservations[] {
  const byName = new Map<string, ObservationRow[]>();

  for (const row of rows) {
    if (!row.participantName) continue;
    const existing = byName.get(row.participantName) ?? [];
    existing.push(row);
    byName.set(row.participantName, existing);
  }

  const result: ParticipantObservations[] = [];

  for (const [name, observations] of byName) {
    const tagCounts: Record<string, number> = {};
    const evalDimensionCounts: Record<string, { positive: number; negative: number; total: number }> = {};

    for (const obs of observations) {
      // Tag counts
      for (const tag of obs.tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }

      // Eval dimension breakdown
      if (obs.evalDimension) {
        const dims = obs.evalDimension.split(/[,;，]/).map(d => d.trim()).filter(Boolean);
        for (const dim of dims) {
          if (!evalDimensionCounts[dim]) evalDimensionCounts[dim] = { positive: 0, negative: 0, total: 0 };
          evalDimensionCounts[dim].total++;
          const hasPositive = obs.tags.some(t => POSITIVE_TAGS.has(t));
          const hasNegative = obs.tags.some(t => NEGATIVE_TAGS.has(t));
          if (hasPositive) evalDimensionCounts[dim].positive++;
          if (hasNegative) evalDimensionCounts[dim].negative++;
        }
      }
    }

    result.push({
      name,
      observations: observations.sort(
        (a, b) => a.scene.localeCompare(b.scene) || a.timestamp.localeCompare(b.timestamp)
      ),
      tagCounts,
      evalDimensionCounts,
      totalCount: observations.length,
      recommendedGrade: computeRecommendedGrade(tagCounts),
    });
  }

  result.sort((a, b) => b.totalCount - a.totalCount);
  return result;
}

/** 관찰 기록을 AI 채점 요청용 텍스트로 포맷 */
export function formatObservationsForAI(
  observations: ParticipantObservations[],
  sceneFilter?: string
): string {
  const lines: string[] = [
    "# 할루시네이션: 해고전쟁 — 오빗-컨설팅 직원 행동 관찰 기록",
    ""
  ];

  for (const p of observations) {
    const filtered = sceneFilter
      ? p.observations.filter((o) => o.scene.toLowerCase().includes(sceneFilter.toLowerCase()))
      : p.observations;

    if (filtered.length === 0) continue;

    lines.push(`## ${p.name} (관찰 ${filtered.length}건)`);

    for (const obs of filtered) {
      const tagStr = obs.tags.length > 0 ? `[${obs.tags.join(", ")}]` : "";
      const dimStr = obs.evalDimension ? `{${obs.evalDimension}}` : "";
      lines.push(`- [${obs.scene}] ${dimStr} ${tagStr} ${obs.description}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(csv: string): string[][] {
  return csv
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0)
    .map(parseCSVLine);
}

/** 7대 지표별 추천 등급 산출 (관찰 데이터 기반) */
export function computeDimensionGrades(obs: ParticipantObservations): Record<string, string> {
  const dimKeys: Record<string, string> = {
    "성과 기여도": "contribution",
    "역량 평가": "competency",
    "협업 태도": "collaboration",
    "위기 대응력": "crisis",
    "인간의 직관력": "intuition",
    "윤리적 책임감": "ethics",
    "AI 검증력": "aiVerification",
  };

  const result: Record<string, string> = {};

  for (const [dimLabel, dimKey] of Object.entries(dimKeys)) {
    // Filter observations for this dimension
    const dimObs = obs.observations.filter(o =>
      o.evalDimension.includes(dimLabel)
    );

    if (dimObs.length === 0) {
      result[dimKey] = "C"; // no data
      continue;
    }

    let positive = 0, negative = 0;
    for (const o of dimObs) {
      for (const tag of o.tags) {
        if (POSITIVE_TAGS.has(tag)) positive++;
        if (NEGATIVE_TAGS.has(tag)) negative++;
      }
    }

    const total = positive + negative;
    if (total === 0) { result[dimKey] = "C"; continue; }

    const ratio = positive / total;
    if (ratio >= 0.9) result[dimKey] = "S";
    else if (ratio >= 0.75) result[dimKey] = "A";
    else if (ratio >= 0.6) result[dimKey] = "B";
    else if (ratio >= 0.4) result[dimKey] = "C";
    else if (ratio >= 0.2) result[dimKey] = "D";
    else result[dimKey] = "F";
  }

  return result;
}

export function buildSheetURL(sheetId: string, gid = "0"): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

export async function fetchObservations(sheetId: string, gid = "0"): Promise<ObservationRow[]> {
  const url = buildSheetURL(sheetId, gid);
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();
  return parseObservationRows(csv);
}
