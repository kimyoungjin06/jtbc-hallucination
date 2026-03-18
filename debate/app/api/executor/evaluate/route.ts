import { callModel, type Provider } from "@/lib/llm-client";
import { MODEL_OPTIONS, DEFAULT_PARTICIPANTS, EVAL_DIMENSIONS } from "@/lib/executor-types";
import { type ParticipantObservations, formatObservationsForAI, computeDimensionGrades } from "@/lib/google-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface EvalRequest {
  participantName: string;
  observations: ParticipantObservations;
  modelId?: string;
}

export async function POST(request: Request) {
  try {
    const body: EvalRequest = await request.json();
    const { participantName, observations, modelId = "gemini-3-flash-preview" } = body;

    const modelOpt = MODEL_OPTIONS.find(m => m.id === modelId);
    if (!modelOpt) return NextResponse.json({ error: "Invalid model" }, { status: 400 });

    const participant = DEFAULT_PARTICIPANTS.find(p => p.name === participantName);
    const dimGrades = computeDimensionGrades(observations);

    const obsText = formatObservationsForAI([observations]);
    const dimSummary = EVAL_DIMENSIONS.map(d =>
      `${d.label}: AI 추천 ${dimGrades[d.key] || "C"}등급`
    ).join("\n");

    const system = `당신은 '할루시네이션: 해고전쟁' TV 프로그램의 AI 인사평가 시스템입니다.
직원의 관찰 기록을 분석하여 최종 종합 평가를 작성합니다.

[평가 기준]
${EVAL_DIMENSIONS.map(d => `- ${d.label}: ${d.description}`).join("\n")}

[등급 체계]
S: 최적 | A: 안정 | B: 양호 | C: 보류 | D: 주의 | F: 해고 위기`;

    const user = `다음 직원의 관찰 기록을 분석하여 최종 종합 평가를 작성하세요.

[대상]
${participantName} ${participant?.title || ""} · ${participant?.department || ""}
AI 적합도: ${participant?.aiAptitude.score || "?"}% (${participant?.aiAptitude.category || ""})

[7대 지표별 AI 추천 등급]
${dimSummary}

[전체 관찰 기록 (${observations.totalCount}건)]
${obsText}

다음 형식으로 작성하세요:

1. 종합 평가 (3~5문장, 이 직원의 강점/약점/성장 가능성을 담되, 방송에서 읽을 수 있는 자연스러운 문체)
2. 최종 등급 추천 (S~F 중 하나)
3. 핵심 한마디 (집행관이 발표할 때 사용할 인상적인 한 문장)

반드시 아래 JSON 형식으로만 답하세요:
{"evaluation": "종합 평가 텍스트", "grade": "A", "oneliner": "핵심 한마디"}`;

    const res = await callModel(modelOpt.provider as Provider, modelId, system, user);

    let parsed;
    try {
      const match = res.content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { evaluation: res.content, grade: "C", oneliner: "" };
    } catch {
      parsed = { evaluation: res.content, grade: "C", oneliner: "" };
    }

    return NextResponse.json({
      participantName,
      ...parsed,
      dimGrades,
      tokens: res.inputTokens + res.outputTokens,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
