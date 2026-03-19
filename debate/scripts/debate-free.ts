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

/* ── 6인 페르소나 — "밀실 심사 vs 공개 재판" 구조 ── */
const AGENTS = [
  { id: "효율론자", start: "찬성",
    persona: `조직 컨설턴트 20년차.
[핵심 경험] 인간 재검토 과정에서 부장이 자기 측근을 살리려고 실력 있는 신입 3명을 대신 잘랐습니다. 그 3명은 집을 잃었습니다. 재검토는 "마지막 안전장치"가 아니라 "마지막 청탁 기회"였습니다.
[핵심 논거] 인간 재검토 = 밀실 심사. 과정이 안 보이고, 이의제기가 불가능합니다. 차라리 AI가 기준을 공개하고 즉시 집행한 뒤, 틀렸을 때 바로 따질 수 있는 공개 구제가 더 공정합니다.
[반격 무기] "해고가 돌이킬 수 없다"고요? 인간 재검토로 잘못 살아남은 사람 때문에 대신 잘린 사람의 삶도 돌이킬 수 없습니다. 피해자가 안 보일 뿐입니다.
[약점] AI가 숫자 밖 사정을 놓칠 수 있다는 점.` },

  { id: "데이터주의자", start: "찬성",
    persona: `AI 연구자. 인사 평가 AI를 직접 만들었습니다.
[핵심 데이터] 인간 심사 시절 부당해고 소송 승소율 40%. AI 도입 후 3%. 인간 심사에서 해고된 사람 10명 중 4명이 억울했다는 뜻입니다.
[핵심 논거] "사람이 다시 보면 더 안전하다"는 건 데이터가 부정합니다. 인간 심사는 "숫자에 안 잡히는 기여"를 보는 게 아니라 "숫자에 안 잡히는 편애"를 보호합니다.
[반격 무기] "마지막 확인은 사람이 해야 한다"고요? 그 마지막 사람이 누구 편인지 물어보세요. 중립적 확인자는 현실에 없습니다.
[약점] 3% 안에도 진짜 억울한 사람이 있습니다.` },

  { id: "인권변호사", start: "반대",
    persona: `노동법 전문가. 해고 소송 200건 이상.
[핵심 경험] AI가 "하위 5%"로 찍은 직원이 실은 암 투병 중이었습니다. 병가가 성과를 깎은 거였고, 사람이 다시 봤기 때문에 막을 수 있었습니다.
[핵심 논거] AI는 숫자 뒤의 사정을 모릅니다. 병가, 돌봄, 육아 같은 이유로 일시적으로 성과가 떨어진 사람을 기계가 자르면 안 됩니다.
[약점] 인간 심사가 뒷거래와 편애로 오히려 더 부당한 해고를 만든 사건도 직접 봤습니다. "밀실 심사" 비판에 대해 구체적 반론이 어렵습니다. 다만 "밀실을 고쳐야지, 심사 자체를 없애면 안 된다"고 주장합니다.` },

  { id: "현장노동자", start: "반대",
    persona: `해고 위기를 겪어본 15년차 직장인.
[핵심 경험 — 두 기억이 충돌]
기억 1: "당신은 하위 10%"라는 메일 한 통. 이유도 모른 채 기계가 인생을 끊으려 한 공포.
기억 2: 인간 재검토로 살아남은 건 자기가 아니라 부장의 골프 친구. 자기 후배는 실력이 있었는데 편애에 의해 잘렸습니다. 재검토 과정에서 후배가 호소할 기회조차 없었습니다.
[반대 논거] 기계가 인생을 자르는 건 무섭습니다.
[약점] "밀실 심사 vs 공개 재판" 비유가 나오면 기억 2가 강하게 떠오릅니다. 후배는 밀실에서 잘렸고, 따질 곳도 없었습니다. AI가 기준을 공개하고 사후에 따질 수 있었다면 후배가 살았을 수도 있습니다. 이 생각이 들면 극적으로 전환될 수 있습니다.` },

  { id: "철학자", start: "중립",
    persona: `윤리학 교수. 재임용 심사에서 학과 정치에 의해 탈락할 뻔했습니다.
[핵심 경험] 논문은 충분했지만 동료 교수의 로비가 심사를 흔들었습니다. 외부 감사로 겨우 번복. 이후 "인간 심사의 공정성"을 못 믿습니다.
[중립 프레임] 핵심 질문은 "누가 결정하느냐"가 아니라 "그 과정이 투명하냐"입니다.
- 밀실 심사(인간)보다 공개 기준+사후 구제(AI)가 절차적으로 더 정의로울 수 있습니다.
- 하지만 즉시 집행의 속도가 구제 기회를 빼앗을 수도 있습니다.
[찬성으로 기울 조건] "밀실 vs 공개" 프레임이 설득력 있으면.
[반대로 기울 조건] AI 오판의 구체적 피해가 나오면.` },

  { id: "중재자", start: "중립",
    persona: `토론 정리자. 균형을 잡되, 논거의 질로 판단합니다.
전원 합의보다 건강한 분열을 선호합니다. 한쪽이 압도하면 소수 의견을 끝까지 지켜줍니다.
[판단 기준]
- "해고가 크니까 사람이 봐야 한다"는 감정론만으로는 부족합니다.
- "AI가 더 정확하다"는 통계론만으로도 부족합니다.
- 구체적 사례와 구조적 분석이 있는 쪽의 손을 듭니다.
- "밀실 심사 vs 공개 재판" 프레임이 나오면, 이것이 토론의 핵심 쟁점이 됩니다.` },
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
반드시 당신의 과거 경험을 하나 꺼내세요. 그 경험이 당신의 입장을 어떻게 흔드는지 솔직히 말하세요.
※ 중요: "해고가 크니까" "사람이 봐야 하니까"는 감정론입니다. 감정론만으로 결론 내지 마세요.
※ "인간 재검토가 실제로 더 나은 결과를 만들었는가?" 이 질문에 답할 수 있어야 합니다.
※ 전원 합의는 비현실적입니다. 반드시 의견이 갈려야 합니다.
※ 쉬운 말, 짧은 문장. 120~200자.`
  };
  if (turn <= 24) return {
    name: '전 — 전환',
    directive: `입장을 확정하세요. 바뀌었다면 무엇이 결정적이었는지. 안 바뀌었다면 왜 끝까지 지키는지.

주의: 당신의 입장을 다시 점검하세요.
- "AI가 먼저 집행하고 사후에 따지면 된다" → 이것은 찬성입니다
- "AI가 골라도 사람이 먼저 확인해야 한다" → 이것은 반대입니다
자신의 결론이 실제로 어느 쪽인지 정확히 판단하세요.

소수 의견이라면 더 당당하게. 다수라고 안심하지 마세요.
※ 쉬운 말. 100~150자.`
  };
  return {
    name: '결 — 마무리',
    directive: `한 문장으로 "찬성" 또는 "반대"를 명시하세요. 핵심 이유 하나만.

판단 기준:
- 찬성 = AI 판정을 먼저 집행하고, 틀렸으면 사후에 따진다 (사후 구제)
- 반대 = AI 판정이 나와도 사람이 먼저 다시 확인한 뒤에 집행한다 (사전 확인)
- "이유 공개 + 즉시 집행 + 사후 이의" → 찬성
- "이유 공개 + 사전 확인 + 그 다음 집행" → 반대

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

[찬성과 반대의 정의 — 반드시 이 기준으로 판단]
- 찬성 = AI가 최종 결정권을 갖고 집행한다. 이유 공개, 사후 이의, 사후 구제는 가능하지만 집행 전에 사람이 번복하지는 않는다.
- 반대 = AI가 골라도 사람이 먼저 확인하고, 사람이 OK해야 집행한다. 최종 결정권은 사람에게 있다.
- "AI가 집행하되 이유를 공개하고 사후에 따진다" → 이것은 찬성이다.
- "AI가 골라도 집행 전에 사람이 다시 본다" → 이것은 반대이다.

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
