import { callModel, type Provider } from "@/lib/llm-client";
import { DEBATE_TOPICS, AI_AGENT_PERSONAS, MODEL_OPTIONS, getPersonaTeam, type PersonaTeam } from "@/lib/executor-types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const TOPIC = DEBATE_TOPICS[2];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Sentence splitter ── */

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ── State update prompt ── */

function stateUpdatePrompt(conversation: string[], prevStates?: AgentInternalState[]) {
  const agentList = AI_AGENT_PERSONAS.map(
    (a) => `${a.id} (${a.role}): ${a.description}`
  ).join("\n");
  const conv =
    conversation.length > 0
      ? conversation.join("\n\n")
      : "(아직 발언 없음 — 첫 발언자를 정하세요)";

  const prevStateText = prevStates
    ? "\n[이전 턴 상태 — 반드시 참고하세요]\n" + prevStates.map(s =>
        `${s.id}: position=${s.position || "neutral"}, urgency=${s.urgency}, emotion=${s.emotion}`
      ).join("\n")
    : "";

  return {
    system: `당신은 TV 토론 프로그램의 진행 AI입니다. 토론 흐름을 분석하고 참가자의 내부 상태를 판단합니다.
반드시 유효한 JSON으로만 답하세요. JSON 외의 텍스트를 포함하지 마세요.`,
    user: `[토론 주제]
${TOPIC.title}: ${TOPIC.description}

[찬성] ${TOPIC.agreeLabel}
[반대] ${TOPIC.disagreeLabel}

[참가자]
${agentList}
${prevStateText}

[지금까지의 대화]
${conv}

각 참가자의 현재 상태를 분석하고 다음 발언자를 정하세요.

JSON 형식:
{
  "debate_phase": "opening",
  "phase_intensity": 2,
  "next_speaker": "ai?",
  "addressed_to": "",
  "should_conclude": false,
  "consensus": {"direction":"none", "strength":0, "agree_count":0, "disagree_count":0},
  "key_moment": {"happened":false, "type":"", "description":""},
  "concession": {"happened":false, "from":"", "to":"", "point":""},
  "states": [
    {"id":"ai1", "urgency":0, "thought":"속마음15자이내", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"},
    {"id":"ai2", "urgency":0, "thought":"", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"},
    {"id":"ai3", "urgency":0, "thought":"", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"},
    {"id":"ai4", "urgency":0, "thought":"", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"},
    {"id":"ai5", "urgency":0, "thought":"", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"},
    {"id":"ai6", "urgency":0, "thought":"", "emotion":"calm", "reaction_emoji":"", "position":"neutral", "think_time":"normal"}
  ],
  "interrupt": {
    "will_happen": false,
    "by": "",
    "after_sentence": 0,
    "trigger": ""
  }
}

규칙:

[토론 강도 곡선]
- debate_phase: "opening"|"developing"|"heated"|"converging"
- phase_intensity: 1~10
- opening(턴1~3): 탐색적 발언, 끼어들기 없음, 모두 calm. 질문이나 느낌 수준
- developing(턴4~8): 본격 논쟁 시작, 끼어들기 가능, agitated 증가. 근거와 반박
- heated(턴9~20): 가장 격렬한 공방. 끼어들기 빈번(urgency 7이면 가능), passionate 다수. 직접 반박, 이름 부르며 지적
- converging(턴20+): 양보와 수용 시작. 끼어들기 낮음, calm 복귀. "인정합니다" 표현

[발언자 선택]
- urgency(0-10)가 가장 높은 사람이 next_speaker
- addressed_to: 직전 발언자가 특정인을 지명했다면 그 사람 ID (지명된 사람의 urgency를 10으로)
- 아직 발언하지 않은 사람의 urgency를 높여주세요

[끼어들기]
- opening 단계에서는 끼어들기 불가 (will_happen: false)
- heated 단계: urgency 7 이상이면 끼어들기 가능
- after_sentence: 1~3

[합의 추적]
- consensus.direction: "none"|"leaning_agree"|"leaning_disagree"|"agreed"|"disagreed"
- consensus.strength: 0~1
- consensus.agree_count/disagree_count: 참가자 수
- should_conclude: 6명 전원이 같은 position(모두 agree 또는 모두 disagree)일 때만 true (true이면 next_speaker를 ai6 철학자로)
- 팀 전체 6명이 만장일치로 합의해야 토론이 끝납니다. conditional이나 neutral이 남아있으면 계속하세요

[입장 변화 — 매우 중요!]
- 토론이 진행되면서 참가자들의 position은 점진적으로 변해야 합니다
- neutral → agree 또는 neutral → disagree 전환은 자유롭습니다 (여러 명 동시 가능)
- 하지만 agree → disagree 또는 disagree → agree 직접 전환은 한 턴에 최대 1명만 가능합니다
- agree → conditional → disagree 순서로 단계적 전환이 자연스럽습니다
- converging 단계에서는 소수 의견이 다수 쪽으로 수렴해야 합니다

[드라마 장치]
- key_moment: 토론 흐름을 바꾸는 핵심 발언이 있었으면 {"happened":true, "type":"turning_point"|"strong_argument"|"emotional_appeal", "description":"한줄설명"}
- concession: 누군가 양보하거나 입장을 바꿨으면 {"happened":true, "from":"ai?", "to":"ai?", "point":"양보한 논점"} — developing 이후 적극적으로 발생시키세요
- think_time: "normal"|"long" (long이면 깊이 고민 중 — 입장이 흔들리는 순간에 사용)

[상태]
- position: "agree"|"disagree"|"neutral"|"conditional"
- emotion: calm|thoughtful|agitated|passionate
- reaction_emoji: 직전 발언 반응 (동의:👍✅💪 반대:👎😤❌ 의문:🤔❓🧐 감탄:💡🔥✨ 경고:⚠️❗ 양보:🤝 무반응:"")
- thought: 패널에 표시되므로 자연스러운 혼잣말 형태로

[매우 중요: 입장 변화 규칙]
- 이전 턴의 position을 반드시 참고하세요
- neutral → agree/disagree: 자유 (여러 명 동시 가능)
- agree ↔ disagree 직접 전환: 한 턴에 최대 1명, 매우 강한 이유 필요
- agree → conditional 또는 disagree → conditional: 자유 (양보 표현)
- 전원이 동시에 agree↔disagree 전환하는 것은 절대 불가능합니다`,
  };
}

/* ── Parse state JSON ── */

interface AgentInternalState {
  id: string;
  urgency: number;
  thought: string;
  emotion: string;
  reaction_emoji: string;
  position?: string;
  think_time?: string;
}
interface StateUpdate {
  next_speaker: string;
  states: AgentInternalState[];
  interrupt: {
    will_happen: boolean;
    by: string;
    after_sentence: number;
    trigger: string;
  };
}

function parseState(raw: string): StateUpdate {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {
    /* fallback below */
  }
  return {
    next_speaker:
      AI_AGENT_PERSONAS[Math.floor(Math.random() * 6)].id,
    states: AI_AGENT_PERSONAS.map((a) => ({
      id: a.id,
      urgency: 5,
      thought: "...",
      emotion: "calm",
      reaction_emoji: "",
      position: "neutral",
      think_time: "normal",
    })),
    interrupt: { will_happen: false, by: "", after_sentence: 0, trigger: "" },
  };
}

/* ── Speech prompt ── */

const PHASE_INSTRUCTIONS: Record<string, string> = {
  opening: "이 주제에 대해 탐색적으로 짧게 의견을 밝히세요. 1~2문장으로. 아직 확신보다는 질문이나 느낌 수준으로.",
  developing: "자신의 입장을 근거와 함께 본격적으로 전개하세요. 다른 참가자의 발언을 직접 인용하며 반박하거나 지지하세요. 3~4문장으로. 감정을 담아 열정적으로.",
  heated: "가장 강하게 주장하세요. 반대 의견을 직접 이름 부르며 반박하세요. '그건 틀렸습니다', '동의할 수 없습니다' 같은 직접적 표현을 사용하세요. 4~5문장으로. 격앙된 톤도 허용됩니다.",
  converging: "격론 끝에 한 발 물러서세요. '인정할 건 인정합니다', '그 부분은 제가 부족했습니다' 같은 양보 표현을 써주세요. 2~3문장으로. 합의점을 찾아가세요.",
};

function speechPrompt(
  agent: (typeof AI_AGENT_PERSONAS)[number],
  conversation: string[],
  thought: string,
  phase: string,
  addressedTo?: string
) {
  const conv = conversation.length > 0 ? conversation.join("\n\n") : "(첫 발언입니다)";
  const phaseInst = PHASE_INSTRUCTIONS[phase] || PHASE_INSTRUCTIONS.developing;
  const addressNote = addressedTo
    ? `\n당신은 방금 지명을 받았습니다. ${addressedTo}의 질문이나 지적에 직접 응답하세요.`
    : "";
  return {
    system: `당신은 '할루시네이션: 해고전쟁' TV 토론 프로그램의 패널입니다.

${agent.systemPrompt}

[토론 주제]
${TOPIC.title}: ${TOPIC.description}

[지금까지의 대화]
${conv}`,
    user: `${phaseInst}${thought ? ` 현재 생각: ${thought}` : ""}${addressNote}
한국어로, 제목 없이. 반드시 완전한 문장으로 끝내세요.
팀 전체가 하나의 결론(찬성 또는 반대)에 도달해야 합니다.
다른 참가자의 논거가 설득력 있었다면 솔직히 입장을 수정하세요.`,
  };
}

/* ── Interrupt prompt ── */

function interruptPrompt(
  agent: (typeof AI_AGENT_PERSONAS)[number],
  conversation: string[],
  partialSpeech: string[],
  trigger: string
) {
  return {
    system: `당신은 '할루시네이션: 해고전쟁' TV 토론 프로그램의 패널입니다.

${agent.systemPrompt}

[토론 주제]
${TOPIC.title}: ${TOPIC.description}

[지금까지의 대화]
${conversation.join("\n\n")}

[방금 발언 중 — 아직 끝나지 않음]
${partialSpeech.join(" ")}`,
    user: `참다 못해 끼어들었습니다. 이유: ${trigger}
직전 발언의 구체적 내용을 인용하며 즉시 반박하세요.
"잠깐요" 또는 "잠깐만요" 등으로 시작하세요.
한국어로, 2~3문장으로 짧고 강렬하게.`,
  };
}

/* ── Summary prompt ── */

function summaryPrompt(conversation: string[], consensusDirection: string) {
  const position = consensusDirection === "tied" ? "팽팽"
    : (consensusDirection === "leaning_agree" || consensusDirection === "agreed") ? "찬성" : "반대";
  return {
    system: `당신은 '할루시네이션: 해고전쟁' TV 토론의 철학자이자 종합 정리자입니다.

${AI_AGENT_PERSONAS[5].systemPrompt}

[토론 주제]
${TOPIC.title}: ${TOPIC.description}
[찬성] ${TOPIC.agreeLabel}
[반대] ${TOPIC.disagreeLabel}`,
    user: `팀 토론 결과 "${position}" 쪽으로 합의가 이루어졌습니다.

아래 토론 내용을 바탕으로, AI 팀의 최종 입장문을 작성하세요.

규칙:
- "우리 AI 팀은 ${position}합니다." 로 시작하세요
- 4~5문장, 전체 300자 이내
- 전문 용어 금지. 중학생도 이해할 수 있는 쉽고 일상적인 단어만 사용하세요
- "비가역적", "절차적 정당성", "GDPR" 같은 단어 대신 "되돌릴 수 없는", "제대로 된 절차", "개인정보 보호법" 같이 풀어서 쓰세요
- 논문이 아닌 토론 결론답게, 감성과 논리를 함께 담으세요
- 토론에서 실제로 나온 이야기를 자연스럽게 녹이세요
- 마지막 문장은 반드시 마침표(.)로 끝내세요
- 제목 없이 본문만

${conversation.join("\n\n")}`,
  };
}

/* ── POST: SSE 라이브 토론 ── */

export async function POST(request: Request) {
  const body = await request.json();
  const {
    modelId = "gpt-5.4",
    thinkModelId = "gemini-3.1-flash-lite-preview",
    maxTurns = 50,
    team = "A",
  } = body as { modelId?: string; thinkModelId?: string; maxTurns?: number; team?: PersonaTeam };

  const speechOpt = MODEL_OPTIONS.find((m) => m.id === modelId);
  const thinkOpt = MODEL_OPTIONS.find((m) => m.id === thinkModelId) || speechOpt;
  if (!speechOpt) {
    return Response.json({ error: "Invalid modelId" }, { status: 400 });
  }

  const agents = getPersonaTeam(team);
  const MAX_TURNS = Math.min(maxTurns, 50);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      const startTime = Date.now();
      const hb = setInterval(() => {
        send("heartbeat", { turn: 0, elapsed: Math.floor((Date.now() - startTime) / 1000) });
      }, 5000);

      try {
        const conversation: string[] = [];
        const spokenAgents = new Set<string>();
        let totalIn = 0, totalOut = 0, thinkCostIn = 0, thinkCostOut = 0;
        let turnCount = 0;
        let lastConsensus = { direction: "none", strength: 0, agree_count: 0, disagree_count: 0 };
        let prevStates: AgentInternalState[] | undefined;

        // Context compression for long debates
        function getConversation() {
          if (conversation.length <= 12) return conversation;
          const older = conversation.slice(0, -10);
          const recent = conversation.slice(-10);
          const summary = "[이전 발언 요약]\n" + older.map(c =>
            c.length > 80 ? c.slice(0, 80) + "..." : c
          ).join("\n");
          return [summary, ...recent];
        }

        // Default initial states (for first turn skip)
        const defaultStates = agents.map((a, i) => ({
          id: a.id, urgency: i === 0 ? 8 : 5,
          thought: i === 0 ? "이 주제에 대해 먼저 입을 열어야겠다" : "다른 사람의 의견을 들어보자",
          emotion: "calm" as const, reaction_emoji: "", position: "neutral", think_time: "normal",
        }));
        let debatePhase = "opening";

        while (turnCount < MAX_TURNS) {
          turnCount++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let state: StateUpdate & { debate_phase?: string; addressed_to?: string; key_moment?: any; concession?: any };

          if (turnCount === 1) {
            /* ── 첫 턴: 상태 업데이트 스킵 ── */
            send("status", { message: "토론을 시작합니다..." });
            state = {
              next_speaker: agents[0].id,
              states: defaultStates,
              interrupt: { will_happen: false, by: "", after_sentence: 0, trigger: "" },
              debate_phase: "opening",
            };
            send("states", { states: state.states });
          } else {
            /* ── 내부 상태 업데이트 ── */
            send("status", { message: `턴 ${turnCount} — 내부 상태 분석 중...` });
            const sp = stateUpdatePrompt(getConversation(), prevStates);
            const stateRaw = await callModel(thinkOpt!.provider as Provider, thinkModelId, sp.system, sp.user);
            thinkCostIn += stateRaw.inputTokens;
            thinkCostOut += stateRaw.outputTokens;
            state = parseState(stateRaw.content) as typeof state;

            // Server validation: max 1 direct agree↔disagree flip per turn
            // neutral→anything and anything→conditional are free
            if (prevStates) {
              let directFlipCount = 0;
              for (const s of state.states) {
                const prev = prevStates.find(p => p.id === s.id);
                if (!prev || !prev.position || !s.position) continue;
                const wasAgreeOrDisagree = prev.position === "agree" || prev.position === "disagree";
                const isAgreeOrDisagree = s.position === "agree" || s.position === "disagree";
                const isDirectFlip = wasAgreeOrDisagree && isAgreeOrDisagree && prev.position !== s.position;
                if (isDirectFlip) {
                  directFlipCount++;
                  if (directFlipCount > 1) {
                    s.position = prev.position; // Revert
                  }
                }
              }
            }

            // Track phase
            if (state.debate_phase) debatePhase = state.debate_phase;
            send("phase", { phase: debatePhase, intensity: (state as unknown as { phase_intensity?: number }).phase_intensity || 5 });

            // Track consensus
            const consensus = (state as unknown as { consensus?: typeof lastConsensus }).consensus;
            if (consensus) {
              lastConsensus = consensus;
              send("consensus", consensus);
            }

            // Key moment
            if (state.key_moment?.happened) {
              send("key_moment", state.key_moment);
            }

            // Concession
            if (state.concession?.happened) {
              send("concession", state.concession);
            }

            send("states", { states: state.states });
          }

          /* ── 발언 생성 ── */
          const speaker = agents.find((a) => a.id === state.next_speaker) || agents[0];
          const speakerState = state.states.find((s) => s.id === speaker.id);
          const thinkTime = speakerState?.think_time === "long" ? "long" : "normal";

          send("status", { message: `${speaker.role} 발언 생성 중...` });
          send("speaking", { agentId: speaker.id, thinkTime });

          // Find who addressed this speaker (addressed_to = the agent being addressed)
          const addressedBy = state.addressed_to === speaker.id && conversation.length > 0
            ? (() => {
                // Find the previous speaker from conversation
                const lastEntry = conversation[conversation.length - 1];
                const match = lastEntry.match(/^\[(.+?)\]/);
                return match ? match[1] : undefined;
              })()
            : undefined;

          const sPrompt = speechPrompt(speaker, getConversation(), speakerState?.thought || "", debatePhase, addressedBy);
          const speechRaw = await callModel(speechOpt.provider as Provider, modelId, sPrompt.system, sPrompt.user);
          totalIn += speechRaw.inputTokens;
          totalOut += speechRaw.outputTokens;

          const sentences = splitSentences(speechRaw.content);
          const interrupt = state.interrupt;
          let wasInterrupted = false;

          /* ── 문장 단위 전송 ── */
          for (let i = 0; i < sentences.length; i++) {
            const validInterrupter = interrupt.will_happen && interrupt.by && interrupt.by !== speaker.id && agents.some(a => a.id === interrupt.by);
            if (validInterrupter && i >= interrupt.after_sentence) {
              /* ── 끼어들기! ── */
              send("interrupt", { by: interrupt.by, target: speaker.id, cutAt: i });
              const partialText = sentences.slice(0, i);
              conversation.push(`[${speaker.role}] (끊김): ${partialText.join(" ")}`);

              const interrupter = agents.find((a) => a.id === interrupt.by) || agents[3];
              send("status", { message: `${interrupter.role} 끼어들기!` });
              send("speaking", { agentId: interrupter.id });

              const iPrompt = interruptPrompt(interrupter, getConversation(), partialText, interrupt.trigger);
              const intRaw = await callModel(speechOpt.provider as Provider, modelId, iPrompt.system, iPrompt.user);
              totalIn += intRaw.inputTokens;
              totalOut += intRaw.outputTokens;

              for (const s of splitSentences(intRaw.content)) {
                send("sentence", { agentId: interrupter.id, text: s });
              }

              conversation.push(`[${interrupter.role}] (끼어들기): ${intRaw.content}`);
              spokenAgents.add(interrupter.id);
              wasInterrupted = true;
              break;
            }

            send("sentence", { agentId: speaker.id, text: sentences[i], seq: i });

            // Reactions after first sentence
            if (i === 0) {
              for (const st of state.states) {
                if (st.id !== speaker.id && st.reaction_emoji) {
                  send("reaction", { agentId: st.id, emoji: st.reaction_emoji, targetId: speaker.id });
                }
              }
            }
          }

          if (!wasInterrupted) {
            conversation.push(`[${speaker.role}]: ${speechRaw.content}`);
          }
          spokenAgents.add(speaker.id);

          // Save states for next turn
          prevStates = state.states;

          // Progress
          send("progress", { turn: turnCount, maxTurns: MAX_TURNS, spoken: spokenAgents.size });

          // Ensure all agents have a position (LLM may omit)
          for (const s of state.states) {
            if (!s.position) s.position = "neutral";
          }

          // Server-side consensus: count actual positions from agent states
          const positions = state.states.map(s => s.position!);
          const serverAgree = positions.filter(p => p === "agree").length;
          const serverDisagree = positions.filter(p => p === "disagree").length;
          const serverConditional = positions.filter(p => p === "conditional").length;
          const serverNeutral = positions.filter(p => p === "neutral").length;

          // Override LLM consensus with actual position counts (only if agents have taken sides)
          if (serverAgree + serverDisagree > 0) {
            // Use server-counted positions
            const computedDirection = serverAgree > serverDisagree ? "leaning_agree"
              : serverDisagree > serverAgree ? "leaning_disagree" : "tied";
            const majority = Math.max(serverAgree, serverDisagree);
            const computedStrength = majority / 6;
            lastConsensus = {
              direction: computedDirection,
              strength: computedStrength,
              agree_count: serverAgree,
              disagree_count: serverDisagree,
            };
            send("consensus", lastConsensus);
          }

          // Termination — 모두 같은 입장이어야 종료
          const MIN_TURNS = 15;
          const allSamePosition = serverNeutral === 0 && serverConditional === 0 &&
            (serverAgree === 6 || serverDisagree === 6);

          if (allSamePosition && turnCount >= MIN_TURNS) break;
        }

        /* ── 철학자 종합 ── */
        clearInterval(hb);

        // Final consensus from actual positions
        const finalDirection = lastConsensus.agree_count > lastConsensus.disagree_count
          ? "leaning_agree"
          : lastConsensus.disagree_count > lastConsensus.agree_count
            ? "leaning_disagree"
            : "tied";

        send("status", { message: `철학자가 토론을 종합합니다... (${finalDirection === "leaning_agree" ? "찬성" : "반대"} ${lastConsensus.agree_count}:${lastConsensus.disagree_count})` });

        const philosopher = agents.find(a => a.id === "ai6") || agents[5];
        send("speaking", { agentId: philosopher.id });

        const sumP = summaryPrompt(getConversation(), finalDirection);
        const sumRaw = await callModel(speechOpt.provider as Provider, modelId, sumP.system, sumP.user);
        totalIn += sumRaw.inputTokens;
        totalOut += sumRaw.outputTokens;

        // Ensure final text ends with a complete sentence
        let finalText = sumRaw.content.trim();
        if (finalText && !finalText.endsWith(".") && !finalText.endsWith("다.") && !finalText.endsWith("요.") && !finalText.endsWith("!")) {
          // Find last complete sentence
          const lastPeriod = Math.max(finalText.lastIndexOf("다."), finalText.lastIndexOf("."), finalText.lastIndexOf("요."));
          if (lastPeriod > finalText.length * 0.5) {
            finalText = finalText.slice(0, lastPeriod + 1);
          } else {
            finalText += ".";
          }
        }

        send("final", {
          agentId: philosopher.id,
          content: finalText,
          chars: finalText.replace(/\s/g, "").length,
        });

        const speechCost = (totalIn / 1_000_000) * speechOpt.costPer1MInput + (totalOut / 1_000_000) * speechOpt.costPer1MOutput;
        const thinkCost = (thinkCostIn / 1_000_000) * thinkOpt!.costPer1MInput + (thinkCostOut / 1_000_000) * thinkOpt!.costPer1MOutput;

        send("done", {
          totalTokens: totalIn + totalOut + thinkCostIn + thinkCostOut,
          estimatedCost: speechCost + thinkCost,
          model: modelId, thinkModel: thinkModelId,
          turns: turnCount,
        });
      } catch (err) {
        send("error", { error: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(hb);
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
}
