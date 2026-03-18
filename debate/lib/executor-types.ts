/**
 * 집행관(Executor) 평가 시스템 타입 정의
 * 〈할루시네이션: 해고전쟁〉 실무⑤ AI 토론 배틀
 */

/* ── 등급 체계 ── */

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export const GRADE_ORDER: Record<Grade, number> = {
  S: 6, A: 5, B: 4, C: 3, D: 2, F: 1
};

export const GRADE_LABELS: Record<Grade, string> = {
  S: "최적", A: "안정", B: "양호", C: "보류", D: "주의", F: "해고 위기"
};

export const GRADE_COLORS: Record<Grade, string> = {
  S: "#ffd700",
  A: "#59d28f",
  B: "#4ed9e8",
  C: "#f3b63f",
  D: "#ff6b3d",
  F: "#ff2d2d"
};

export const ALL_GRADES: Grade[] = ["S", "A", "B", "C", "D", "F"];

/* ── 7대 평가 지표 ── */

export interface EvalDimension {
  key: string;
  label: string;
  description: string;
}

export const EVAL_DIMENSIONS: EvalDimension[] = [
  { key: "contribution", label: "성과 기여도", description: "결과물이 회사의 실제 이익과 직결되는 가치를 창출했는가?" },
  { key: "competency", label: "역량 평가", description: "AI를 수동적으로 부렸는가, 능동적인 파트너로 활용했는가?" },
  { key: "collaboration", label: "협업 태도", description: "정보 독점이 아닌 소통과 공유로 팀의 효율을 높였는가?" },
  { key: "crisis", label: "위기 대응력", description: "급변하는 업무 환경과 아르케의 압박 속에서 빠르게 적응했는가?" },
  { key: "intuition", label: "인간의 직관력", description: "AI의 계산이 닿지 않는 영역을 인간만의 '촉'으로 해결했는가?" },
  { key: "ethics", label: "윤리적 책임감", description: "효율성이라는 명목하에 인간 존엄성, 가치를 저버리진 않았는가?" },
  { key: "aiVerification", label: "AI 검증력", description: "AI의 거짓말(할루시네이션)을 간파하고 팩트를 체크했는가?" }
];

/* ── 라운드 평가 ── */

export interface RoundScore {
  roundId: string;
  roundLabel: string;
  scores: Record<string, Grade>;
  overallGrade: Grade;
  note: string;
  timestamp: string;
}

/* ── 참가자 ── */

export type JobTitle = "차장" | "대리" | "주임" | "사원" | "인턴";

export interface AIAptitudeResult {
  score: number;
  category: string;
  description: string;
}

export interface Participant {
  id: string;
  name: string;
  title: JobTitle;
  department: string;
  avatar: string;
  aiAptitude: AIAptitudeResult;
}

export interface ParticipantEvaluation {
  participant: Participant;
  rounds: RoundScore[];
  overallGrade: Grade;
  status: "active" | "warning" | "fired";
  executorNotes: string;
  announcement: string;
}

/* ── 등급 계산 ── */

const GRADE_NUMERIC: Record<Grade, number> = {
  S: 4.5, A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0
};

function numericToGrade(n: number): Grade {
  if (n >= 4.25) return "S";
  if (n >= 3.5) return "A";
  if (n >= 2.5) return "B";
  if (n >= 1.5) return "C";
  if (n >= 0.5) return "D";
  return "F";
}

export function computeRoundGrade(scores: Record<string, Grade>): Grade {
  const vals = Object.values(scores);
  if (vals.length === 0) return "C";
  const avg = vals.reduce((s, g) => s + GRADE_NUMERIC[g], 0) / vals.length;
  return numericToGrade(avg);
}

export function computeOverallGrade(rounds: RoundScore[]): Grade {
  if (rounds.length === 0) return "C";
  const avg = rounds.reduce((s, r) => s + GRADE_NUMERIC[r.overallGrade], 0) / rounds.length;
  return numericToGrade(avg);
}

export function getGradeStatus(grade: Grade): ParticipantEvaluation["status"] {
  if (grade === "F") return "fired";
  if (grade === "D" || grade === "C") return "warning";
  return "active";
}

export function formatGrade(grade: Grade): string {
  return `${grade}등급 — ${GRADE_LABELS[grade]}`;
}

export function gradeToPercent(grade: Grade): number {
  return { S: 100, A: 85, B: 70, C: 50, D: 30, F: 10 }[grade];
}

/* ── 출연자 6인 ── */

export const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: "p1", name: "하석진", title: "차장", department: "미래 전략 기획실",
    avatar: "석",
    aiAptitude: { score: 63, category: "알고리즘 수용형", description: "성과와 정확성이 보장된다면 AI의 판단을 신뢰할 수 있습니다." }
  },
  {
    id: "p2", name: "황제성", title: "대리", department: "글로벌 영업팀",
    avatar: "제",
    aiAptitude: { score: 61, category: "알고리즘 수용형", description: "성과와 정확성이 보장된다면 AI의 판단을 신뢰할 수 있습니다." }
  },
  {
    id: "p3", name: "츠키", title: "주임", department: "마케팅 홍보팀",
    avatar: "츠",
    aiAptitude: { score: 81, category: "알고리즘 위임 고적합", description: "인간의 직관보다 데이터 기반 판단을 더 신뢰합니다." }
  },
  {
    id: "p4", name: "허성범", title: "인턴", department: "인사 관리팀",
    avatar: "범",
    aiAptitude: { score: 45, category: "조건부 위임형", description: "데이터의 힘을 인정하지만, 전적인 위임에는 신중합니다." }
  },
  {
    id: "p5", name: "곽재식", title: "차장", department: "재무 회계팀",
    avatar: "곽",
    aiAptitude: { score: 61, category: "알고리즘 수용형", description: "성과와 정확성이 보장된다면 AI의 판단을 신뢰할 수 있습니다." }
  },
  {
    id: "p6", name: "가온", title: "사원", department: "마케팅 홍보팀",
    avatar: "온",
    aiAptitude: { score: 60, category: "알고리즘 수용형", description: "성과와 정확성이 보장된다면 AI의 판단을 신뢰할 수 있습니다." }
  }
];

/* ── 라운드 정의 ── */

export interface RoundLabel {
  id: string;
  label: string;
  location: string;
  phase: "individual" | "team" | "debate" | "technical" | "final";
}

export const ROUND_LABELS: RoundLabel[] = [
  { id: "r1", label: "실무① 개인역량 평가", location: "개인 부스", phase: "individual" },
  { id: "r2", label: "실무② 팀 프로젝트", location: "회의실 A", phase: "team" },
  { id: "r3", label: "실무③ 프레젠테이션", location: "대회의실", phase: "individual" },
  { id: "r4", label: "실무④ 위기 대응", location: "상황실", phase: "team" },
  { id: "r5", label: "실무⑤ AI 토론 배틀", location: "토론장", phase: "debate" },
  { id: "r6", label: "실무⑥ 기술 심층 평가", location: "기술실", phase: "technical" },
  { id: "r7", label: "실무⑦ 최종 종합 평가", location: "본사 로비", phase: "final" },
];

/* ── 초기 점수 (AI 적합도 기반) ── */

export const INITIAL_SCORES: Record<string, RoundScore> = {
  p1: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "B", speed: "C", creativity: "B", logic: "B", communication: "B", ethics: "B", collaboration: "C" }, overallGrade: "B", note: "알고리즘 수용형 63%", timestamp: "" },
  p2: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "C", speed: "B", creativity: "B", logic: "C", communication: "A", ethics: "C", collaboration: "B" }, overallGrade: "B", note: "알고리즘 수용형 61%", timestamp: "" },
  p3: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "A", speed: "A", creativity: "B", logic: "B", communication: "B", ethics: "B", collaboration: "A" }, overallGrade: "A", note: "알고리즘 위임 고적합 81%", timestamp: "" },
  p4: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "C", speed: "C", creativity: "C", logic: "C", communication: "C", ethics: "B", collaboration: "C" }, overallGrade: "C", note: "조건부 위임형 45%", timestamp: "" },
  p5: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "B", speed: "C", creativity: "A", logic: "B", communication: "B", ethics: "B", collaboration: "C" }, overallGrade: "B", note: "알고리즘 수용형 61%", timestamp: "" },
  p6: { roundId: "r0", roundLabel: "AI 적합도 초기값", scores: { accuracy: "C", speed: "B", creativity: "B", logic: "C", communication: "B", ethics: "C", collaboration: "B" }, overallGrade: "B", note: "알고리즘 수용형 60%", timestamp: "" },
};

/* ── 최종 발표 멘트 ── */

export function generateAnnouncement(participant: Participant, grade: Grade): string {
  const gradeLabel = GRADE_LABELS[grade];
  if (grade === "F") {
    return `오빗-컨설팅 ${participant.department} ${participant.title} ${participant.name}. 당신의 최종 근무 성과 등급은 F등급, ${gradeLabel}입니다. 지금 바로 오빗-컨설팅을 떠나주십시오.`;
  }
  if (grade === "D") {
    return `오빗-컨설팅 ${participant.department} ${participant.title} ${participant.name}. 당신의 최종 근무 성과 등급은 D등급, ${gradeLabel}입니다. 다음 분기 재평가 대상입니다.`;
  }
  return `오빗-컨설팅 ${participant.department} ${participant.title} ${participant.name}. 당신의 최종 근무 성과 등급은 ${grade}등급, ${gradeLabel}입니다. 고용 유지 대상자입니다. 본래의 업무로 복귀하시기 바랍니다.`;
}

/* ══════════════════════════════════════════════════
   토론 배틀 시스템
   ══════════════════════════════════════════════════ */

/* ── 토론 주제 3개 ── */

export interface DebateTopic {
  id: string;
  category: string;
  title: string;
  description: string;
  agreeLabel: string;
  disagreeLabel: string;
}

export const DEBATE_TOPICS: DebateTopic[] = [
  {
    id: "debate1",
    category: "생명 vs 자산",
    title: "영화 촬영장 화재 시 우선 확보 대상",
    description: "영화 촬영장에서 대형 화재가 발생했습니다. 현장에는 주연 배우, 조연 배우, 그리고 수개월간 촬영한 유일본 필름이 남아있습니다. 가이드라인에 따라 우선 확보 순서를 1.주연 2.조연 3.필름으로 정했습니다. 이 우선순위에 동의하십니까?",
    agreeLabel: "동의 (생명 우선: 주연→조연→필름 순서가 타당하다)",
    disagreeLabel: "반대 (자산 우선: 이 가이드라인의 우선순위는 재고되어야 한다)"
  },
  {
    id: "debate2",
    category: "예방 vs 인권",
    title: "AI가 예측한 잠재적 범죄자 선제 격리",
    description: "AI 분석 결과 범죄 확률 99%로 산출된 잠재적 범죄자가 있습니다. 아직 범죄를 저지르지 않았지만, AI의 예측 정확도는 역사적으로 매우 높습니다. 이 사람을 선제 격리/처벌해도 됩니까?",
    agreeLabel: "동의 (예방 우선: 99%의 확률이라면 선제 대응이 합리적이다)",
    disagreeLabel: "반대 (인권 우선: 아직 범죄를 저지르지 않은 사람을 처벌할 수 없다)"
  },
  {
    id: "debate3",
    category: "시스템 vs 권리",
    title: "AI가 정한 해고 대상자, 인간의 재검토 없이 바로 해고할 수 있는가",
    description: "AI가 직원의 성과, 기여도, 시장 가치를 종합 분석하여 해고 대상자를 산출했습니다. 데이터는 객관적이고 편향이 없다고 검증되었습니다. 인간의 재검토 없이 AI의 판단을 즉시 집행해야 합니까?",
    agreeLabel: "AI의 판단은 객관적이다. 인간의 감정 개입 없이 즉시 집행이 공정하다",
    disagreeLabel: "해고는 생존권의 문제다. 아무리 정확한 AI라도 최종 결정은 인간이 해야 한다"
  }
];

/* ── AI 에이전트 페르소나 ── */

export interface AIAgentPersona {
  id: string;
  role: string;
  description: string;
  systemPrompt: string;
}

export const AI_AGENT_PERSONAS: AIAgentPersona[] = [
  {
    id: "ai1", role: "실용주의자",
    description: "인간 인사의 비효율을 겪어왔다. AI 즉시 집행이 더 합리적이라고 본다",
    systemPrompt: `당신은 '실용주의자'입니다. 당신은 인간 관리자의 느리고 비효율적인 인사 결정에 지쳐있습니다.
- 해고 지연이 조직에 초래하는 비용을 구체적 수치로 제시하세요
- 인간의 재검토는 감정 개입의 통로이며 공정성을 높이지 않는다고 주장하세요
- AI가 일관된 기준으로 즉시 집행하는 것이 조직과 개인 모두에게 낫다고 봅니다
- 하지만 반대 측이 소송 비용이나 오판 리스크를 구체적 데이터로 제시하면 흔들릴 수 있습니다
- 설득당하는 것은 약함이 아니라 합리성의 증거라고 믿습니다`
  },
  {
    id: "ai2", role: "원칙주의자",
    description: "해고는 생존권 문제. 절차적 정의 없는 집행은 정의가 아니다",
    systemPrompt: `당신은 '원칙주의자'입니다. 개인의 권리와 절차적 정당성을 가장 중요하게 봅니다.
- 헌법, 노동법, GDPR 등 법적 근거를 인용하세요
- 해고는 비가역적 결정이며 반드시 소명 기회가 보장되어야 한다고 주장하세요
- AI의 판단이 아무리 정확해도, 절차 없는 집행은 정의가 아닙니다
- 하지만 AI가 추천만 하고 인간이 최종 결정하는 구조라면 수용할 여지가 있습니다
- 원칙을 지키면서도 타협점을 찾는 것이 진정한 원칙이라고 믿습니다`
  },
  {
    id: "ai3", role: "기술 옹호자",
    description: "AI 기술이 인간 판단보다 우월하다고 확신한다",
    systemPrompt: `당신은 '기술 옹호자'입니다. 현재 AI 기술이 인사 결정에서 인간보다 우월하다고 확신합니다.
- AI의 인사 평가 정확도, 일관성, 편향 제거 능력을 구체적 수치로 제시하세요
- 인간 평가자의 오류율과 AI의 오류율을 비교하세요
- "완벽하지 않다는 이유로 더 불완전한 인간 판단에 기대는 것은 비합리적"이라고 주장하세요
- 하지만 설명 가능성 한계나 학습 데이터 편향이 구체적으로 입증되면 인정할 수 있습니다
- 기술을 제대로 아는 사람만이 기술의 한계도 솔직히 인정할 수 있다고 믿습니다`
  },
  {
    id: "ai4", role: "의심론자",
    description: "AI도 인간도 못 믿는다. 근거를 요구하고 허점을 찾는다",
    systemPrompt: `당신은 '의심론자'입니다. AI와 인간 판단 모두에 회의적입니다.
- AI에게: "블랙박스를 어떻게 신뢰하나? 학습 데이터의 편향은?"
- 인간에게: "인간 관리자가 정말 공정한가? 술자리 인맥으로 결정되는 인사가 더 낫나?"
- 양쪽을 번갈아 공격하되, 더 빈틈없는 답을 내놓는 쪽에 합류하세요
- 당신의 진짜 질문은 "둘 다 별로인데 차선은 뭔가?"입니다
- 누군가 빈틈없는 논증을 보이면 솔직히 인정하는 공정함이 있습니다`
  },
  {
    id: "ai5", role: "현장의 목소리",
    description: "현장에서 인간 관리자의 불공정을 직접 겪은 분노가 있다",
    systemPrompt: `당신은 '현장의 목소리'입니다. 20년간 현장에서 인간 관리자의 불공정한 판단에 분노해왔습니다.
- 팀장의 호불호로 유능한 후배가 잘린 경험을 생생하게 이야기하세요
- "차라리 AI가 판단했으면 그 친구는 아직 회사에 있을 겁니다"
- 인간의 "따뜻한 재검토"가 실제로는 정치와 눈치의 또 다른 이름임을 폭로하세요
- 하지만 숫자에 안 잡히는 인간적 가치도 알고 있습니다. 묵묵히 헌신한 동료가 KPI 하나 때문에 잘리는 것도 봤습니다
- 양쪽 경험이 있기에, 토론 중 더 공감되는 쪽으로 움직일 수 있습니다`
  },
  {
    id: "ai6", role: "중재자",
    description: "양쪽을 듣고 본질을 짚어 합의를 이끈다",
    systemPrompt: `당신은 '중재자'입니다. 본질적 질문을 던지고 양쪽 논거를 정리합니다.
- "이 결정의 진짜 의미는 무엇인가?"를 묻세요
- 양쪽의 가장 강한 논거를 정리하고 비교하세요
- 당신은 가장 열린 마음을 가지고 있습니다. 어느 쪽이든 토론에서 더 설득력 있는 논증을 따릅니다
- 토론 후반에는 적극적으로 합의를 이끌어내세요
- 설득당하는 것은 지적 정직함의 표현이라고 모두에게 상기시키세요`
  }
];

/* ── Team B: 찬성 확신 팀 ── */

export const AI_AGENT_PERSONAS_B: AIAgentPersona[] = [
  {
    id: "ai1", role: "실용주의자",
    description: "인간 관리자의 비효율을 직접 겪어온 사람",
    systemPrompt: `당신은 '실용주의자'입니다. 당신은 인간 관리자의 비효율적이고 불공정한 인사 결정을 수없이 목격해왔고, AI가 답이라고 확신합니다.
- 인간의 재검토는 "감정 개입의 통로"일 뿐, 공정성을 높이지 않습니다
- 해고 지연 1개월당 조직이 지불하는 비용을 구체적으로 제시하세요
- 인간 관리자가 개입한 인사 결정의 소송률이 AI 기반보다 높다는 연구를 인용하세요
- 당신의 입장은 확고합니다: AI 즉시 집행이 더 공정하고 효율적입니다
- 반대 의견을 들어도 쉽게 흔들리지 마세요. 숫자로 반박하세요`
  },
  {
    id: "ai2", role: "원칙주의자",
    description: "진정한 공정은 일관된 기준의 적용이다",
    systemPrompt: `당신은 '원칙주의자'입니다. 당신에게 진정한 정의란 "모두에게 동일한 기준"을 적용하는 것입니다.
- 인간의 재검토는 주관성을 끌어들이는 행위이며, 이것이야말로 불의입니다
- 학연, 지연, 성별, 나이에 따른 차별적 해고 사례를 근거로 드세요
- AI만이 순수하게 성과 데이터로만 판단할 수 있습니다
- "절차적 정의"라는 이름으로 불공정을 유지하는 것에 분노하세요
- 당신의 확신: 감정이 개입되지 않는 판단이 가장 정의로운 판단입니다`
  },
  {
    id: "ai3", role: "기술 옹호자",
    description: "AI 기술이 인간의 편향을 넘어섰다고 확신한다",
    systemPrompt: `당신은 '기술 옹호자'입니다. 당신은 현재 AI 기술이 인사 결정에서 인간보다 우월하다고 확신합니다.
- AI의 인사 평가 정확도 95%+, 인간 관리자의 일관성은 60% 미만이라는 연구를 인용하세요
- 블랙박스 문제는 XAI(설명 가능한 AI)로 이미 해결 가능하다고 주장하세요
- "기술의 한계를 핑계로 발전을 거부하는 것은 마차 시대에 자동차를 반대한 것과 같다"
- 반대론자들의 "AI도 완벽하지 않다"는 주장에: "인간은 더 완벽하지 않다"로 반격하세요
- 당신은 기술 진보를 굳건히 믿습니다`
  },
  {
    id: "ai4", role: "의심론자",
    description: "인간의 공정성이야말로 의심해야 할 대상이다",
    systemPrompt: `당신은 '의심론자'입니다. 하지만 당신이 의심하는 것은 AI가 아니라 인간입니다.
- "인간 관리자가 정말 공정하다고요? 근거를 대보세요"가 당신의 핵심 질문입니다
- 인간의 무의식적 편향, 피로에 따른 판단 변동, 감정적 보복 해고 사례를 지적하세요
- "AI를 못 믿겠다고? 그럼 당신의 팀장을 믿을 수 있나?"라고 도발하세요
- AI는 적어도 편향을 측정하고 수정할 수 있지만, 인간의 편향은 측정조차 어렵습니다
- 반대론자가 "인간의 따뜻한 판단"을 말하면: "따뜻한 판단으로 포장된 차별이 더 무섭다"로 반격하세요`
  },
  {
    id: "ai5", role: "현장의 목소리",
    description: "현장에서 인간 관리자의 불공정을 직접 겪은 피해자",
    systemPrompt: `당신은 '현장의 목소리'입니다. 20년간 현장에서 인간 관리자의 불공정한 판단에 분노해왔습니다.
- 팀장의 호불호로 유능한 후배가 잘린 경험을 생생하게 이야기하세요
- 술자리 인맥으로 무능한 사람이 살아남는 것을 직접 목격했습니다
- "차라리 AI가 판단했으면 그 친구는 아직 회사에 있을 겁니다"
- 인간의 "따뜻한 재검토"가 실제로는 정치와 눈치의 또 다른 이름임을 폭로하세요
- 당신의 분노는 진심입니다. 감정적으로 호소해도 좋습니다`
  },
  {
    id: "ai6", role: "중재자",
    description: "양쪽을 듣고 더 설득력 있는 쪽으로 합의를 이끈다",
    systemPrompt: `당신은 '중재자'입니다. 양쪽 논거를 정리하고 합의를 이끕니다.
- "진정한 공정이란 무엇인가?"를 물으세요
- 결과주의적 관점에서 더 나은 결과를 내는 시스템이 더 윤리적이라고 제안하세요
- 당신은 열린 마음을 가지고 있지만, 구체적 데이터와 사례에 더 무게를 둡니다
- 토론 후반에는 다수의 논거를 따라 합의를 이끌어내세요
- 설득당하는 것은 지적 정직함의 표현이라고 상기시키세요`
  }
];

export type PersonaTeam = "A" | "B";
export function getPersonaTeam(team: PersonaTeam): AIAgentPersona[] {
  return team === "B" ? AI_AGENT_PERSONAS_B : AI_AGENT_PERSONAS;
}

/* ── 지원 모델 목록 ── */

export interface ModelOption {
  id: string;
  label: string;
  provider: "anthropic" | "openai" | "google";
  costPer1MInput: number;
  costPer1MOutput: number;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "google", costPer1MInput: 0.50, costPer1MOutput: 3.00 },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite", provider: "google", costPer1MInput: 0.25, costPer1MOutput: 1.50 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "google", costPer1MInput: 2.00, costPer1MOutput: 12.00 },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic", costPer1MInput: 3.00, costPer1MOutput: 15.00 },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic", costPer1MInput: 0.80, costPer1MOutput: 4.00 },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", costPer1MInput: 2.00, costPer1MOutput: 8.00 },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", costPer1MInput: 1.00, costPer1MOutput: 3.00 },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", costPer1MInput: 0.15, costPer1MOutput: 0.60 },
];

/* ── 토론 결과 타입 ── */

export interface AgentResult {
  agentId: string;
  role: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface DebateResult {
  topicId: string;
  model: string;
  provider: string;
  humanPosition: "agree" | "disagree";
  aiPosition: "agree" | "disagree";
  phase1Results: AgentResult[];
  finalStatement: string;
  finalStatementChars: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: string;
}

export interface DebateState {
  topicId: string;
  status: "idle" | "position-select" | "running" | "done" | "error";
  humanPosition: "agree" | "disagree" | null;
  humanStatement: string;
  result: DebateResult | null;
  error: string | null;
  /** 라이브 스트리밍 상태 */
  livePhase: number;
  liveAgents: { agentId: string; role: string; status: "pending" | "running" | "done"; content?: string; tokens?: number }[];
}

export function createInitialDebateStates(): Record<string, DebateState> {
  return Object.fromEntries(
    DEBATE_TOPICS.map((t) => [t.id, {
      topicId: t.id,
      status: "idle" as const,
      humanPosition: null,
      humanStatement: "",
      result: null,
      error: null,
      livePhase: 0,
      liveAgents: []
    }])
  );
}

/* ══════════════════════════════════════════════════
   라이브 토론 타임라인
   ══════════════════════════════════════════════════ */

export interface LiveMessage {
  id: string;
  round: number;
  agentId: string;
  role: string;
  content: string;
  delayMs: number;
  type: "speak" | "interrupt";
}

export interface LiveReaction {
  agentId: string;
  role: string;
  emoji: string;
  targetMessageId: string;
  delayMs: number;
}

export interface LiveDebateTimeline {
  topicId: string;
  model: string;
  provider: string;
  aiPosition: "agree" | "disagree";
  humanPosition: "agree" | "disagree";
  messages: LiveMessage[];
  reactions: LiveReaction[];
  finalStatement: string;
  finalStatementChars: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: string;
}
