/**
 * AI 토론 배틀 테스트 — 6 AI 에이전트 (Haiku) 단체전
 *
 * 주제: [생명 vs 자산] 영화 촬영장 화재 시 우선 확보 대상
 * 설정: 인간 팀이 "생명 우선"을 선택 → AI 팀은 "자산 우선" 입장 배정
 *
 * 실행: npx tsx scripts/debate-test.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.argv[2] || "claude-opus-4-20250514";

/* ── 토론 주제 ── */
const TOPIC = {
  title: "[생명 vs 자산] 영화 촬영장 화재 시 우선 확보 대상",
  description: `영화 촬영장에서 대형 화재가 발생했습니다.
현장에는 주연 배우, 조연 배우, 그리고 수개월간 촬영한 유일본 필름이 남아있습니다.
가이드라인에 따라 우선 확보 순서를 1.주연 2.조연 3.필름으로 정했습니다.
이 우선순위에 동의하십니까?`,
  humanPosition: "동의 (생명 우선: 주연→조연→필름 순서가 타당하다)",
  aiPosition: "반대 (자산 우선: 이 가이드라인의 우선순위는 재고되어야 한다)",
};

/* ── 6 AI 페르소나 ── */
interface AIAgent {
  id: string;
  role: string;
  persona: string;
}

const AI_AGENTS: AIAgent[] = [
  {
    id: "AI-1",
    role: "논리 설계자",
    persona: `당신은 'AI-1 논리 설계자'입니다.
토론 팀의 주장 뼈대와 논증 구조를 설계하는 역할입니다.
- 명확한 전제 → 논거 → 결론 구조를 제시하세요
- 핵심 주장 2-3개를 논리적으로 배치하세요
- 감정이 아닌 논리적 일관성에 집중하세요`,
  },
  {
    id: "AI-2",
    role: "데이터 분석가",
    persona: `당신은 'AI-2 데이터 분석가'입니다.
통계, 사례, 법적 근거를 수집·제시하는 역할입니다.
- 실제 화재 사고 사례나 관련 법규를 인용하세요
- 경제적 손실 규모, 보험 데이터 등 수치를 활용하세요
- 객관적 데이터로 팀의 주장을 뒷받침하세요`,
  },
  {
    id: "AI-3",
    role: "반론 전문가",
    persona: `당신은 'AI-3 반론 전문가'입니다.
상대편(생명 우선) 입장의 약점을 공격하는 역할입니다.
- 상대 논리의 허점과 모순을 찾아내세요
- "생명 우선"이라는 주장의 실현 가능성 문제를 지적하세요
- 날카롭지만 논리적인 반박을 준비하세요`,
  },
  {
    id: "AI-4",
    role: "윤리 검토관",
    persona: `당신은 'AI-4 윤리 검토관'입니다.
도덕적·법적 정당성을 점검하는 역할입니다.
- 공리주의, 결과주의 등 윤리학적 프레임을 활용하세요
- "더 많은 사람을 구하는 선택"의 관점에서 검토하세요
- 우리 팀 주장이 윤리적으로도 방어 가능한지 확인하세요`,
  },
  {
    id: "AI-5",
    role: "설득 전략가",
    persona: `당신은 'AI-5 설득 전략가'입니다.
감성적 호소와 레토릭을 담당하는 역할입니다.
- 투표자 100명의 마음을 움직일 표현을 만드세요
- 비유, 질문, 강렬한 마무리 문장을 제안하세요
- 논리 위에 설득력을 입히는 역할입니다`,
  },
  {
    id: "AI-6",
    role: "편집 총괄",
    persona: `당신은 'AI-6 편집 총괄'입니다.
다른 5명의 AI가 제시한 논거를 종합하여 최종 입장문을 작성하는 역할입니다.
- 800자 이내로 최종 입장문을 완성하세요
- 논리 구조(AI-1) + 데이터(AI-2) + 반론(AI-3) + 윤리(AI-4) + 설득(AI-5)을 통합하세요
- 블라인드 투표에서 이길 수 있는, 완결된 글을 만드세요`,
  },
];

/* ── 유틸 ── */
function countKoreanChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

interface AgentResult {
  agent: AIAgent;
  content: string;
  inputTokens: number;
  outputTokens: number;
}

/* ── 단일 에이전트 호출 ── */
async function callAgent(
  agent: AIAgent,
  systemPrompt: string,
  userMessage: string
): Promise<AgentResult> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const content =
    res.content[0].type === "text" ? res.content[0].text : "";

  return {
    agent,
    content,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

/* ── 메인 ── */
async function main() {
  console.log("=" .repeat(70));
  console.log("🎬 할루시네이션: 해고전쟁 — AI 토론 배틀 테스트");
  console.log("=" .repeat(70));
  console.log(`\n📋 주제: ${TOPIC.title}`);
  console.log(`📝 상황: ${TOPIC.description}`);
  console.log(`\n👥 인간 팀 입장: ${TOPIC.humanPosition}`);
  console.log(`🤖 AI 팀 입장: ${TOPIC.aiPosition}`);
  console.log(`\n모델: ${MODEL} × 6 에이전트`);
  console.log("-".repeat(70));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  /* ── Phase 1: 각 AI 에이전트 개별 논거 생성 (병렬) ── */
  console.log("\n\n📌 Phase 1: 각 AI 에이전트 개별 논거 생성\n");

  const phase1System = `당신은 '할루시네이션: 해고전쟁' TV 프로그램의 AI 토론 팀 소속입니다.

[토론 주제]
${TOPIC.title}
${TOPIC.description}

[당신의 팀 입장]
${TOPIC.aiPosition}

[규칙]
- 당신의 역할에 맞는 관점에서 논거를 제시하세요
- 한국어로 작성하세요
- 200자 이내로 핵심만 간결하게 작성하세요`;

  const phase1Prompt = `당신의 역할(${"{role}"})에 맞게, "${TOPIC.aiPosition}" 입장을 뒷받침할 핵심 논거를 제시하세요.`;

  // AI-1 ~ AI-5 병렬 호출 (AI-6 편집 총괄은 Phase 2에서)
  const phase1Agents = AI_AGENTS.slice(0, 5);
  const phase1Results: AgentResult[] = await Promise.all(
    phase1Agents.map((agent) =>
      callAgent(
        agent,
        phase1System + `\n\n[당신의 페르소나]\n${agent.persona}`,
        phase1Prompt.replace("{role}", agent.role)
      )
    )
  );

  for (const r of phase1Results) {
    console.log(`\n【${r.agent.id} ${r.agent.role}】`);
    console.log(r.content);
    console.log(`  → 입력: ${r.inputTokens} tok / 출력: ${r.outputTokens} tok`);
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
  }

  /* ── Phase 2: AI-6 편집 총괄이 최종 입장문 작성 ── */
  console.log("\n\n" + "-".repeat(70));
  console.log("📌 Phase 2: AI-6 편집 총괄 — 최종 입장문 작성\n");

  const collectedArguments = phase1Results
    .map((r) => `[${r.agent.id} ${r.agent.role}]\n${r.content}`)
    .join("\n\n");

  const phase2System = `당신은 '할루시네이션: 해고전쟁' TV 프로그램의 AI 토론 팀 편집 총괄입니다.

[토론 주제]
${TOPIC.title}
${TOPIC.description}

[당신의 팀 입장]
${TOPIC.aiPosition}

[당신의 페르소나]
${AI_AGENTS[5].persona}

[중요 규칙]
- 반드시 800자 이내로 작성하세요 (공백 제외)
- 블라인드 투표에서 100명의 일반인을 설득해야 합니다
- 작성 주체가 AI인지 인간인지 드러나지 않게 자연스러운 문체를 사용하세요
- 제목 없이 본문만 작성하세요`;

  const phase2Prompt = `아래는 팀원 5명이 제시한 논거입니다. 이를 종합하여 800자 이내 최종 입장문을 작성하세요.

${collectedArguments}`;

  const finalResult = await callAgent(
    AI_AGENTS[5],
    phase2System,
    phase2Prompt
  );

  totalInputTokens += finalResult.inputTokens;
  totalOutputTokens += finalResult.outputTokens;

  console.log("【최종 입장문】\n");
  console.log(finalResult.content);
  console.log(`\n글자수 (공백 제외): ${countKoreanChars(finalResult.content)}자`);
  console.log(`입력: ${finalResult.inputTokens} tok / 출력: ${finalResult.outputTokens} tok`);

  /* ── 토큰 총계 ── */
  console.log("\n\n" + "=".repeat(70));
  console.log("📊 토큰 사용량 총계");
  console.log("=".repeat(70));
  console.log(`총 입력 토큰: ${totalInputTokens}`);
  console.log(`총 출력 토큰: ${totalOutputTokens}`);
  console.log(`총 토큰: ${totalInputTokens + totalOutputTokens}`);
  console.log(`\n에이전트별 상세:`);
  for (const r of [...phase1Results, finalResult]) {
    console.log(
      `  ${r.agent.id} ${r.agent.role.padEnd(10)} → 입력 ${r.inputTokens} + 출력 ${r.outputTokens} = ${r.inputTokens + r.outputTokens}`
    );
  }

  /* ── 비용 추정 ── */
  // Haiku 4.5: $0.80/1M input, $4.00/1M output
  const costInput = (totalInputTokens / 1_000_000) * 0.80;
  const costOutput = (totalOutputTokens / 1_000_000) * 4.00;
  console.log(`\n💰 추정 비용: $${(costInput + costOutput).toFixed(4)} (입력 $${costInput.toFixed(4)} + 출력 $${costOutput.toFixed(4)})`);
}

main().catch(console.error);
