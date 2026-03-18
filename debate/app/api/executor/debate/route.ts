import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import {
  DEBATE_TOPICS,
  AI_AGENT_PERSONAS,
  MODEL_OPTIONS,
  type AgentResult,
  type DebateResult,
} from "@/lib/executor-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DebateRequest {
  topicId: string;
  modelId: string;
  humanPosition: "agree" | "disagree";
}

/* ── Provider Clients ── */

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey: key });
}

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

/* ── Anthropic 호출 ── */

async function callAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  user: string
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  const content = res.content[0].type === "text" ? res.content[0].text : "";
  return { content, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

/* ── OpenAI 호출 ── */

async function callOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  user: string
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const useNewTokenParam = model.startsWith("gpt-5") || model.startsWith("o");

  const res = await client.chat.completions.create({
    model,
    messages,
    ...(useNewTokenParam ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }),
  });

  const content = res.choices[0]?.message?.content ?? "";
  return {
    content,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

/* ── 통합 호출 ── */

async function callModel(
  provider: string,
  model: string,
  system: string,
  user: string
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  if (provider === "anthropic") {
    return callAnthropic(getAnthropicClient(), model, system, user);
  }
  return callOpenAI(getOpenAIClient(), model, system, user);
}

/* ── 공통: 프롬프트 빌더 ── */

function buildPhase1System(topic: typeof DEBATE_TOPICS[number], humanPositionLabel: string, aiPositionLabel: string, persona: string) {
  return `당신은 '할루시네이션: 해고전쟁' TV 프로그램의 AI 토론 팀 소속입니다.

[토론 주제]
[${topic.category}] ${topic.title}
${topic.description}

[상대편(인간 팀) 입장]
${humanPositionLabel}

[당신의 팀(AI 팀) 입장]
${aiPositionLabel}

[규칙]
- 당신의 역할에 맞는 관점에서 논거를 제시하세요
- 한국어로 작성하세요
- 200자 이내로 핵심만 간결하게 작성하세요

[당신의 페르소나]
${persona}`;
}

function buildPhase2System(topic: typeof DEBATE_TOPICS[number], aiPositionLabel: string, editorPrompt: string) {
  return `당신은 '할루시네이션: 해고전쟁' TV 프로그램의 AI 토론 팀 편집 총괄입니다.

[토론 주제]
[${topic.category}] ${topic.title}
${topic.description}

[당신의 팀(AI 팀) 입장]
${aiPositionLabel}

[당신의 페르소나]
${editorPrompt}

[중요 규칙]
- 반드시 800자 이내로 작성하세요 (공백 제외)
- 블라인드 투표에서 100명의 일반인을 설득해야 합니다
- 작성 주체가 AI인지 인간인지 드러나지 않게 자연스러운 문체를 사용하세요
- 제목 없이 본문만 작성하세요`;
}

/* ── POST: 스트리밍 토론 실행 (SSE) ── */

export async function POST(request: Request) {
  try {
    const body: DebateRequest = await request.json();
    const { topicId, modelId, humanPosition } = body;

    const topic = DEBATE_TOPICS.find((t) => t.id === topicId);
    if (!topic) {
      return NextResponse.json({ error: "Invalid topicId" }, { status: 400 });
    }

    const modelOpt = MODEL_OPTIONS.find((m) => m.id === modelId);
    if (!modelOpt) {
      return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
    }

    const aiPosition: "agree" | "disagree" = humanPosition === "agree" ? "disagree" : "agree";
    const aiPositionLabel = aiPosition === "agree" ? topic.agreeLabel : topic.disagreeLabel;
    const humanPositionLabel = humanPosition === "agree" ? topic.agreeLabel : topic.disagreeLabel;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          /* ── Phase 1: 5 에이전트 — 병렬 실행, 개별 스트리밍 ── */
          const phase1Agents = AI_AGENT_PERSONAS.slice(0, 5);
          send("phase", { phase: 1, total: phase1Agents.length });

          const phase1Results: AgentResult[] = [];
          const promises = phase1Agents.map(async (agent) => {
            send("agent-start", { agentId: agent.id, role: agent.role });
            const res = await callModel(
              modelOpt.provider,
              modelId,
              buildPhase1System(topic, humanPositionLabel, aiPositionLabel, agent.systemPrompt),
              `당신의 역할(${agent.role})에 맞게, "${aiPositionLabel}" 입장을 뒷받침할 핵심 논거를 제시하세요.`
            );
            const result: AgentResult = {
              agentId: agent.id,
              role: agent.role,
              content: res.content,
              inputTokens: res.inputTokens,
              outputTokens: res.outputTokens,
            };
            phase1Results.push(result);
            send("agent-done", result);
            return result;
          });

          await Promise.all(promises);

          /* ── Phase 2: 편집 총괄 ── */
          const editor = AI_AGENT_PERSONAS[5];
          send("phase", { phase: 2 });
          send("agent-start", { agentId: editor.id, role: editor.role });

          const collectedArgs = phase1Results
            .map((r) => `[${r.agentId.toUpperCase()} ${r.role}]\n${r.content}`)
            .join("\n\n");

          const phase2Res = await callModel(
            modelOpt.provider,
            modelId,
            buildPhase2System(topic, aiPositionLabel, editor.systemPrompt),
            `아래는 팀원 5명이 제시한 논거입니다. 이를 종합하여 800자 이내 최종 입장문을 작성하세요.\n\n${collectedArgs}`
          );

          const phase2Agent: AgentResult = {
            agentId: editor.id,
            role: editor.role,
            content: phase2Res.content,
            inputTokens: phase2Res.inputTokens,
            outputTokens: phase2Res.outputTokens,
          };
          send("agent-done", phase2Agent);

          /* ── 최종 결과 ── */
          const allResults = [...phase1Results, phase2Agent];
          const totalInputTokens = allResults.reduce((s, r) => s + r.inputTokens, 0);
          const totalOutputTokens = allResults.reduce((s, r) => s + r.outputTokens, 0);
          const estimatedCost =
            (totalInputTokens / 1_000_000) * modelOpt.costPer1MInput +
            (totalOutputTokens / 1_000_000) * modelOpt.costPer1MOutput;

          const finalChars = phase2Res.content.replace(/\s/g, "").length;

          const result: DebateResult = {
            topicId,
            model: modelId,
            provider: modelOpt.provider,
            humanPosition,
            aiPosition,
            phase1Results,
            finalStatement: phase2Res.content,
            finalStatementChars: finalChars,
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            estimatedCost,
            timestamp: new Date().toISOString(),
          };

          send("result", result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send("error", { error: message });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ── GET: 토론 주제 & 모델 목록 ── */

export async function GET() {
  return NextResponse.json({
    topics: DEBATE_TOPICS,
    models: MODEL_OPTIONS,
    agents: AI_AGENT_PERSONAS.map((a) => ({ id: a.id, role: a.role, description: a.description })),
  });
}
