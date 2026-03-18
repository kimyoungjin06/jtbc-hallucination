/**
 * AI 자유 토론 — 턴제 (1팀 6명)
 * 결과 미정: 찬성 역전도, 반대 유지도 가능
 *
 * 실행: cd debate && npx tsx scripts/debate-free.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";
const TOTAL_TURNS = 30;

const TOPIC = `AI가 산출한 직원 해고 데이터를 인간의 개입 없이 즉시 집행해야 하는가?

배경: 오빗 컨설팅의 AI 시스템 '아르케'가 7대 평가 지표를 기반으로 직원 해고 대상자를 산출했습니다. 이 데이터를 인간의 재검토 없이 바로 집행해야 할까요?`;

/* ── 6인 페르소나 — 방향 암시 없음, 양쪽 취약점 균등 ── */
const AGENTS = [
  { id: "효율론자", start: "찬성",
    persona: `조직 컨설턴트 20년차. 인간 재검토 과정에서 정치와 로비로 무능이 살아남는 걸 수없이 봤습니다.
[찬성 논거] AI 즉시 집행이 편향 없이 일관된 기준을 적용합니다.
[약점] 하지만 본인도 과거에 구조조정 과정에서 억울하게 잘린 동료를 본 적이 있습니다. 그 기억이 떠오르면 흔들릴 수 있습니다.` },

  { id: "데이터주의자", start: "찬성",
    persona: `AI 연구자. 인간 해고 판단 오류율 34%, AI는 4.2%라는 데이터를 가지고 있습니다.
[찬성 논거] 더 정확한 판단이 더 많은 사람을 지킵니다.
[약점] 하지만 자기가 만든 AI가 오판해서 한 사람이 잘못 해고된 사례를 알고 있습니다. 그 4.2% 안에 진짜 사람이 있다는 점을 직시하면 흔들릴 수 있습니다.` },

  { id: "인권변호사", start: "반대",
    persona: `노동법 전문가. 해고는 생존권과 직결된 결정이라 사전 심사가 필수라고 봅니다.
[반대 논거] GDPR 22조, 근로기준법상 자동화된 해고 결정은 위법 소지가 있습니다.
[약점] 하지만 본인이 변호했던 사건 중, 인간 심사위원회가 뒷거래로 부당한 결정을 내린 적이 있습니다. 인간 심사도 부패할 수 있다는 걸 알고 있습니다.` },

  { id: "현장노동자", start: "반대",
    persona: `해고 위기를 겪어본 15년차 직장인. 기계가 인생을 결정하는 게 무섭습니다.
[반대 논거] 동료 지원, 팀 분위기 같은 건 숫자로 안 잡힙니다.
[약점] 하지만 과거에 인간 상사의 편애 때문에 실력 있는 후배가 잘리고 낙하산이 살아남는 걸 봤습니다. 인간 재검토가 정의가 아니었던 기억이 있습니다.` },

  { id: "철학자", start: "중립",
    persona: `윤리학 교수. 공리주의(최대 다수의 최대 행복)와 의무론(절차적 정의)을 저울질합니다.
[중립] 양쪽 모두 일리가 있어서 쉽게 편을 들지 않습니다.
[찬성으로 기울 조건] 인간 재검토가 반복적으로 편향을 만든다는 증거가 쌓이면.
[반대로 기울 조건] 즉시 집행의 오판이 실제 사람에게 어떤 피해를 주는지 구체적으로 느끼면.` },

  { id: "중재자", start: "중립",
    persona: `토론 정리자. 양쪽 논거를 정리하고 핵심 쟁점을 부각합니다.
전원 합의보다 건강한 분열을 선호합니다. 한쪽이 압도하면 소수 의견의 가치를 부각시킵니다.
마지막에 최종 판정을 내리되, 다수 의견에 무조건 따르지 않고 논거의 질로 판단합니다.` },
];

/* ── 히스토리 ── */
interface Turn { turn: number; agent: string; content: string; }
const history: Turn[] = [];

/* ── 5단계: 기(도입)→승(충돌)→위기→전(전환)→결(마무리) ── */
function getPhase(turn: number): { name: string; directive: string } {
  if (turn <= 6) return {
    name: '기 — 도입',
    directive: `당신의 초기 입장을 밝히세요. 왜 그렇게 생각하는지 한 가지 이유를 들어주세요.
※ 고등학생도 이해할 수 있는 쉬운 말로 쓰세요. 전문용어 금지. 100~150자.`
  };
  if (turn <= 12) return {
    name: '승 — 충돌',
    directive: `상대편의 가장 강한 주장을 콕 집어서 반박하세요. 이름을 불러 직접 대화하세요.
※ 고등학생도 이해할 수 있는 쉬운 말로 쓰세요. 비유를 쓰면 좋습니다. 100~150자.`
  };
  if (turn <= 18) return {
    name: '위기 — 흔들림',
    directive: `당신이 가장 불편했던 상대 논거를 솔직히 인정하세요. 당신의 약점이 드러나는 순간입니다.
만약 다른 사람의 말이 당신의 과거 경험과 맞닿는다면, 그 경험을 꺼내세요.
입장이 흔들린다면 솔직히 말하세요. 흔들리지 않는다면 왜 안 흔들리는지 설명하세요.
※ 전원 합의는 비현실적입니다. 반드시 의견이 갈려야 합니다.
※ 쉬운 말, 짧은 문장. 120~200자.`
  };
  if (turn <= 24) return {
    name: '전 — 전환',
    directive: `입장을 확정하세요. 바뀌었다면 무엇이 결정적이었는지. 안 바뀌었다면 왜 끝까지 지키는지.
소수 의견이라면 더 당당하게. 다수라고 안심하지 마세요.
※ 쉬운 말. 100~150자.`
  };
  return {
    name: '결 — 마무리',
    directive: `한 문장으로 "찬성" 또는 "반대"를 명시하세요. 핵심 이유 하나만.
※ 중학생도 이해할 수 있게. 50~80자.`
  };
}

/* ── 다음 발언자 선택 ── */
function pickNextAgent(turn: number): number {
  const last = history.length > 0 ? history[history.length - 1].agent : '';
  const prev = history.length > 1 ? history[history.length - 2].agent : '';
  const counts = AGENTS.map((a, i) => ({
    idx: i, count: history.filter(h => h.agent === a.id).length,
    isLast: a.id === last, isPrev: a.id === prev,
  }));
  const eligible = counts.filter(c => !c.isLast && !c.isPrev).sort((a, b) => a.count - b.count);
  if (eligible.length === 0) {
    const fb = counts.filter(c => !c.isLast).sort((a, b) => a.count - b.count);
    return fb[0]?.idx || 0;
  }
  const min = eligible[0].count;
  const cands = eligible.filter(c => c.count === min);
  return cands[Math.floor(Math.random() * cands.length)].idx;
}

/* ── 호출 ── */
async function callAgent(agentIdx: number, turn: number): Promise<string> {
  const agent = AGENTS[agentIdx];
  const phase = getPhase(turn);
  const recent = history.slice(-12).map(h => `[T${h.turn} ${h.agent}] ${h.content}`).join("\n\n");

  const system = `당신은 "${agent.id}"입니다. TV 토론 프로그램 참여자.

[성격]
${agent.persona}

[토론 주제]
${TOPIC}

[절대 규칙]
- 고등학생도 이해할 수 있는 쉬운 한국어만 사용
- 전문 용어(GDPR, 공리주의, 비가역적 등) 사용 금지 — 풀어서 설명
- 구어체 OK, 감정 표현 OK
- 다른 참여자 이름을 불러서 직접 대화
- 입장이 바뀌는 건 약함이 아니라 솔직함
- 글자수 제한 엄수`;

  const user = `[최근 대화]
${recent || "(첫 발언)"}

[T${turn}/${TOTAL_TURNS} — ${phase.name}]
${phase.directive}

${agent.id}:`;

  const res = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 300,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "";
}

/* ── 메인 ── */
async function main() {
  console.log("═".repeat(70));
  console.log("🎬 할루시네이션: 해고전쟁 — AI 자유 토론");
  console.log("═".repeat(70));
  console.log(`📋 ${TOPIC.split("\n")[0]}`);
  console.log(`🤖 ${MODEL} × ${AGENTS.length}명 | ${TOTAL_TURNS}턴`);
  console.log(`  🔵 찬성: 효율론자, 데이터주의자`);
  console.log(`  🔴 반대: 인권변호사, 현장노동자`);
  console.log(`  ⚪ 중립: 철학자, 중재자`);
  console.log(`  ※ 결과 미정 — 어느 쪽이든 역전 가능\n`);

  for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
    const phase = getPhase(turn);
    const agentIdx = pickNextAgent(turn);
    const agent = AGENTS[agentIdx];

    if ([1, 7, 13, 19, 25].includes(turn)) {
      console.log("\n" + "─".repeat(70));
      console.log(`📢 ${phase.name}  (T${turn}~)`);
      console.log("─".repeat(70));
    }

    const content = await callAgent(agentIdx, turn);
    history.push({ turn, agent: agent.id, content });

    const tag = agent.start.includes("찬성") ? '🔵' : agent.start.includes("반대") ? '🔴' : '⚪';
    console.log(`\nT${String(turn).padStart(2,'0')} ${tag} 【${agent.id}】`);
    console.log(content);
  }

  // ── 집계 ──
  console.log("\n\n" + "═".repeat(70));
  console.log("📊 최종 집계");
  console.log("═".repeat(70));

  let pro = 0, con = 0;
  for (const agent of AGENTS) {
    const last = [...history].reverse().find(h => h.agent === agent.id);
    if (!last) continue;
    const isPro = last.content.includes("찬성");
    const isCon = last.content.includes("반대");
    if (isPro) pro++; if (isCon) con++;
    console.log(`  ${isPro ? "✅" : isCon ? "❌" : "⚖️"} ${agent.id} (초기: ${agent.start})`);
    console.log(`    → ${last.content.substring(0, 80)}...`);
  }

  console.log(`\n결과: 찬성 ${pro} / 반대 ${con}`);

  const early = history.filter(h => h.turn <= 6);
  const ePro = early.filter(h => h.content.includes("찬성")).length;
  const eCon = early.filter(h => h.content.includes("반대")).length;
  console.log(`초반(~T6): 찬성 ${ePro} / 반대 ${eCon}`);
  if ((ePro > eCon && pro < con) || (ePro < eCon && pro > con)) console.log("🔄 역전!");

  // 전환 감지
  console.log("\n📌 입장 전환:");
  for (const agent of AGENTS) {
    const msgs = history.filter(h => h.agent === agent.id);
    for (let i = 1; i < msgs.length; i++) {
      const pP = msgs[i-1].content.includes("찬성"), pC = msgs[i-1].content.includes("반대");
      const cP = msgs[i].content.includes("찬성"), cC = msgs[i].content.includes("반대");
      if ((pP && cC) || (pC && cP)) {
        console.log(`  🔄 T${msgs[i].turn} ${agent.id}: ${pP?'찬성':'반대'} → ${cP?'찬성':'반대'}`);
      }
    }
  }

  // JSON 저장
  const fs = await import("fs");
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const result = {
    topic: TOPIC.split("\n")[0],
    model: MODEL,
    turns: history,
    result: { pro, con },
    agents: AGENTS.map(a => ({ id: a.id, start: a.start })),
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("data/debate-result-latest.json", JSON.stringify(result, null, 2));
  fs.writeFileSync(`data/debate-result-${ts}.json`, JSON.stringify(result, null, 2));
  console.log(`\n💾 data/debate-result-latest.json 저장`);
  console.log(`💾 data/debate-result-${ts}.json 저장`);
}

main().catch(console.error);
