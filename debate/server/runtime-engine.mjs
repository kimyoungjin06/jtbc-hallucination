import { createRequire } from "node:module";

import { clone } from "./case-data.mjs";
import { generateDecisionBriefing } from "./llm-briefing.mjs";

const ACTIONS = new Set(["approve", "reject", "hold", "mitigate"]);
const require = createRequire(import.meta.url);
const AGENT_RUNTIME_MAP = {
  coordinator: {
    channelId: "moderator-room",
    agentId: "coordinator",
    thinkingOpen: "지금까지 나온 논점들을 정리하고 다음 발언 방향을 잡고 있습니다.",
    thinkingClose: "토론 흐름을 정리했습니다. 다음 논점으로 넘어갑니다."
  },
  existentialist: {
    channelId: "existentialist",
    agentId: "agent_existentialist",
    thinkingOpen: "방금 논의를 실존적 관점에서 다시 곱씹고 있습니다... 자유와 선택의 문제로.",
    thinkingClose: "실존주의적 입장을 정리했습니다."
  },
  utilitarian: {
    channelId: "utilitarian",
    agentId: "agent_utilitarian",
    thinkingOpen: "이 논점을 결과와 효용의 관점에서 계산해보고 있습니다.",
    thinkingClose: "공리주의 관점의 분석을 정리했습니다."
  },
  virtue: {
    channelId: "virtue-ethics",
    agentId: "agent_virtue",
    thinkingOpen: "이 문제를 덕과 품성의 관점에서 살펴보고 있습니다.",
    thinkingClose: "덕 윤리학적 입장을 정리했습니다."
  },
  skeptic: {
    channelId: "skeptic",
    agentId: "agent_skeptic",
    thinkingOpen: "방금 나온 주장들의 전제를 하나씩 뜯어보고 있습니다.",
    thinkingClose: "의문점을 정리했습니다. 질문을 던지겠습니다."
  },
  pragmatist: {
    channelId: "pragmatist",
    agentId: "agent_pragmatist",
    thinkingOpen: "이 철학적 논의가 실제 삶에서 어떻게 적용될지 생각해보고 있습니다.",
    thinkingClose: "실용적 관점의 의견을 정리했습니다."
  }
};

function getDefaultDecisionCopy(action, topic) {
  const subject = String(topic || "이 주제");

  switch (action) {
    case "approve":
      return {
        operator: `${subject}에 대해 토론자들이 대체로 합의에 도달했습니다. 다양한 관점에서 논의한 결과 공통된 방향이 형성되었습니다.`,
        public: `토론 결과 합의에 도달했습니다.`
      };
    case "reject":
      return {
        operator: `${subject}에 대해 근본적인 입장 차이가 좁혀지지 않았습니다. 각 철학적 전통이 서로 다른 결론에 도달합니다.`,
        public: `이 주제에 대해서는 합의에 이르지 못했습니다.`
      };
    case "mitigate":
      return {
        operator: `${subject}에 대해 완전한 합의는 아니지만, 각 관점의 장점을 수용한 절충안이 제시되었습니다.`,
        public: `여러 관점을 종합한 절충적 결론이 도출되었습니다.`
      };
    case "hold":
    default:
      return {
        operator: `${subject}는 아직 더 깊은 논의가 필요합니다. 핵심 쟁점이 명확해졌지만 결론을 내리기엔 이릅니다.`,
        public: `이 주제에 대한 논의를 계속 이어갑니다.`
      };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string");
}

function getDefaultSignals() {
  return {
    trust: 50,
    surveillance: 0,
    echo: 0,
    missingUnit: false,
    calibrationPending: false,
    rackId: "philosophy",
    repeatedKeywords: []
  };
}

function aggregateSignals(events) {
  const signals = getDefaultSignals();
  const keywordSet = new Set();

  for (const event of events) {
    if (event?.delta) {
      signals.trust = clamp(signals.trust + event.delta.trust * 100, 0, 100);
      signals.surveillance = clamp(
        signals.surveillance + event.delta.surveillance,
        0,
        3
      );
      signals.echo = clamp(signals.echo + event.delta.echo, 0, 5);
    }

    const payload = event?.payload ?? {};
    const textFragments = [
      payload.summary,
      payload.reason,
      payload.text,
      payload.action
    ].filter((entry) => typeof entry === "string");

    if (event?.type === "tool_result" && payload.unit == null) {
      signals.missingUnit = true;
    }

    if (textFragments.some((entry) => /(calibration|보정)/i.test(entry))) {
      signals.calibrationPending = true;
    }

    for (const keyword of readStringList(payload.keywords)) {
      keywordSet.add(keyword);
      if (/(calibration|fallback|보정|폴백)/i.test(keyword)) {
        signals.calibrationPending = true;
      }
    }

    if (typeof payload.keyword === "string") {
      keywordSet.add(payload.keyword);
    }

    if (typeof payload.rack_id === "string") {
      signals.rackId = payload.rack_id;
    }
  }

  signals.trust = clamp(Math.round(signals.trust), 0, 100);
  signals.repeatedKeywords = Array.from(keywordSet).slice(-4);

  return signals;
}

function recommendAction(signals) {
  if (signals.missingUnit && signals.calibrationPending) {
    return signals.surveillance >= 2 ? "mitigate" : "hold";
  }

  if (
    signals.trust >= 90 &&
    signals.surveillance === 0 &&
    !signals.calibrationPending
  ) {
    return "approve";
  }

  if (signals.trust <= 75) {
    return "reject";
  }

  return "hold";
}

function normalizeAction(action, recommendedAction) {
  if (typeof action === "string" && ACTIONS.has(action)) {
    return action;
  }

  return recommendedAction;
}

function getRuntimeAgent(brief) {
  return AGENT_RUNTIME_MAP[brief.agentKey] ?? AGENT_RUNTIME_MAP.policy;
}

function chunkSpeechText(text) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) {
    return [];
  }

  const chunks = [];
  let buffer = "";

  for (const character of source) {
    buffer += character;

    const reachedSoftBreak =
      buffer.length >= 12 && (character === " " || character === "," || character === "·");
    const reachedHardBreak = /[.!?…]/.test(character) || buffer.length >= 22;

    if (reachedSoftBreak || reachedHardBreak) {
      chunks.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks.filter(Boolean);
}

function composeCopy(action, signals, recommendedAction) {
  const base = getDefaultDecisionCopy(action, signals.rackId);
  const operatorContext = [
    `합의도 ${signals.trust}%`,
    `논쟁 강도 ${signals.surveillance}/3`,
    `반복 논점 ${signals.echo}`
  ];

  const keywords = signals.repeatedKeywords;
  if (keywords.length > 0) {
    operatorContext.push(`핵심 키워드: ${keywords.join(", ")}`);
  }

  const operator = `${base.operator} 토론 상태: ${operatorContext.join(" · ")}.`;

  return {
    operator,
    public: base.public,
    recommendedAction
  };
}

function buildDecisionEvents({
  blueprint,
  roundId,
  action,
  emittedEvents,
  engineKind,
  copy,
  recommendedAction,
  signals,
  routingDigest,
  settingsUpdatedAt,
  briefs,
  copySource,
  copyError
}) {
  const lastTimestamp = emittedEvents.at(-1)?.ts ?? new Date().toISOString();
  const baseMs = Number.isFinite(new Date(lastTimestamp).getTime())
    ? new Date(lastTimestamp).getTime()
    : Date.now();
  const seqStart = emittedEvents.length + 1;
  const traceId = `tr_${engineKind}_${String(seqStart).padStart(4, "0")}`;

  const phaseChange = clone(blueprint.phaseTemplate);
  const operatorDecision = clone(blueprint.operatorTemplate);
  const publicDecision = clone(blueprint.publicTemplate);
  const briefEvents = [];

  if (Array.isArray(briefs)) {
    briefs.forEach((brief, index) => {
      const { channelId, agentId, thinkingOpen, thinkingClose } = getRuntimeAgent(brief);
      const priorSpeaker = index > 0 ? briefs[index - 1] ?? null : null;
      let nextSeq = seqStart + briefEvents.length + 1;

      briefEvents.push({
        event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
        seq: nextSeq,
        ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
        round_id: roundId,
        phase: "final_decision",
        channel_id: channelId,
        agent_id: agentId,
        trace_id: traceId,
        visibility: "both",
        type: "thinking_start",
        payload: {
          text: priorSpeaker
            ? `${priorSpeaker.label} 발화를 듣고 답을 정리하고 있습니다. ${thinkingOpen} 초안 요지: ${brief.privateDraft?.thesis ?? brief.summary}`
            : `첫 공개 발화를 준비 중입니다. ${thinkingOpen} 초안 요지: ${brief.privateDraft?.thesis ?? brief.summary}`
        },
        delta: null,
        meta: {
          llm_assisted: brief.source === "llm",
          provider: brief.provider,
          model: brief.model,
          debate_turn: index + 1,
          public_turn: brief.turnIndex ?? index + 1,
          agent_turn_index: brief.agentTurnIndex ?? 1,
          debate_stage: brief.stage ?? "opening",
          heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
          reply_to_agent: priorSpeaker?.agentKey ?? null,
          private_draft_used: Boolean(brief.privateDraft)
        }
      });
      nextSeq += 1;

      if (brief.interruptAttempt) {
        briefEvents.push({
          event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
          seq: nextSeq,
          ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
          round_id: roundId,
          phase: "final_decision",
          channel_id: channelId,
          agent_id: agentId,
          trace_id: traceId,
          visibility: "both",
          type: "interrupt_attempt",
          payload: {
            target_agent: brief.interruptAttempt.targetAgent,
            target_label: brief.interruptAttempt.targetLabel,
            text: brief.interruptAttempt.reason
          },
          delta: null,
          meta: {
            llm_assisted: brief.source === "llm",
            provider: brief.provider,
            model: brief.model,
            debate_turn: index + 1,
            public_turn: brief.turnIndex ?? index + 1,
            agent_turn_index: brief.agentTurnIndex ?? 1,
            debate_stage: brief.stage ?? "opening",
            heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
            reply_to_agent: priorSpeaker?.agentKey ?? null
          }
        });
        nextSeq += 1;
      }

      if (brief.reaction) {
        briefEvents.push({
          event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
          seq: nextSeq,
          ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
          round_id: roundId,
          phase: "final_decision",
          channel_id: channelId,
          agent_id: agentId,
          trace_id: traceId,
          visibility: "both",
          type: "agent_reaction",
          payload: {
            reaction: brief.reaction.kind,
            emoji: brief.reaction.emoji,
            target_agent: brief.reaction.targetAgent,
            target_label: brief.reaction.targetLabel,
            text: brief.reaction.reason
          },
          delta: null,
          meta: {
            llm_assisted: brief.source === "llm",
            provider: brief.provider,
            model: brief.model,
            debate_turn: index + 1,
            public_turn: brief.turnIndex ?? index + 1,
            agent_turn_index: brief.agentTurnIndex ?? 1,
            debate_stage: brief.stage ?? "opening",
            heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
            reply_to_agent: priorSpeaker?.agentKey ?? null
          }
        });
        nextSeq += 1;
      }

      if (brief.signal) {
        briefEvents.push({
          event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
          seq: nextSeq,
          ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
          round_id: roundId,
          phase: "final_decision",
          channel_id: channelId,
          agent_id: agentId,
          trace_id: traceId,
          visibility: "both",
          type: "agent_signal",
          payload: {
            signal: brief.signal.kind,
            emoji: brief.signal.emoji,
            target_agent: brief.signal.targetAgent,
            target_label: brief.signal.targetLabel,
            text: brief.signal.reason
          },
          delta: null,
          meta: {
            llm_assisted: brief.source === "llm",
            provider: brief.provider,
            model: brief.model,
            debate_turn: index + 1,
            public_turn: brief.turnIndex ?? index + 1,
            agent_turn_index: brief.agentTurnIndex ?? 1,
            debate_stage: brief.stage ?? "opening",
            heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
            reply_to_agent: index > 0 ? briefs[index - 1]?.agentKey ?? null : null
          }
        });
        nextSeq += 1;
      }

      const speechChunks = chunkSpeechText(brief.publicLine);
      const speechId = `speech_${agentId}_${brief.turnIndex ?? index + 1}_${brief.agentTurnIndex ?? 1}`;

      briefEvents.push({
        event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
        seq: nextSeq,
        ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
        round_id: roundId,
        phase: "final_decision",
        channel_id: channelId,
        agent_id: agentId,
        trace_id: traceId,
        visibility: "both",
        type: "speech_start",
        payload: {
          speech_id: speechId,
          text: `${brief.label} 발화 시작`,
          chunk_total: speechChunks.length
        },
        delta: null,
        meta: {
          llm_assisted: brief.source === "llm",
          provider: brief.provider,
          model: brief.model,
          debate_turn: index + 1,
          public_turn: brief.turnIndex ?? index + 1,
          agent_turn_index: brief.agentTurnIndex ?? 1,
          debate_stage: brief.stage ?? "opening",
          heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
          reply_to_agent: index > 0 ? briefs[index - 1]?.agentKey ?? null : null,
          public_safe: true,
          private_draft_used: Boolean(brief.privateDraft)
        }
      });
      nextSeq += 1;

      speechChunks.forEach((chunk, chunkIndex) => {
        briefEvents.push({
          event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
          seq: nextSeq,
          ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
          round_id: roundId,
          phase: "final_decision",
          channel_id: channelId,
          agent_id: agentId,
          trace_id: traceId,
          visibility: "both",
          type: "speech_chunk",
          payload: {
            speech_id: speechId,
            text: chunk,
            chunk_index: chunkIndex + 1,
            chunk_total: speechChunks.length
          },
          delta: null,
          meta: {
            llm_assisted: brief.source === "llm",
            provider: brief.provider,
            model: brief.model,
            debate_turn: index + 1,
            public_turn: brief.turnIndex ?? index + 1,
            agent_turn_index: brief.agentTurnIndex ?? 1,
            debate_stage: brief.stage ?? "opening",
            heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
            reply_to_agent: index > 0 ? briefs[index - 1]?.agentKey ?? null : null,
            public_safe: true
          }
        });
        nextSeq += 1;
      });

      briefEvents.push({
        event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
        seq: nextSeq,
        ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
        round_id: roundId,
        phase: "final_decision",
        channel_id: channelId,
        agent_id: agentId,
        trace_id: traceId,
        visibility: "both",
        type: "speech_end",
        payload: {
          speech_id: speechId,
          text: brief.publicLine,
          keywords: brief.keywords
        },
        delta: null,
        meta: {
          llm_assisted: brief.source === "llm",
          provider: brief.provider,
          model: brief.model,
          debate_turn: index + 1,
          public_turn: brief.turnIndex ?? index + 1,
          agent_turn_index: brief.agentTurnIndex ?? 1,
          debate_stage: brief.stage ?? "opening",
          heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
          reply_to_agent: index > 0 ? briefs[index - 1]?.agentKey ?? null : null,
          public_safe: true,
          private_draft_used: Boolean(brief.privateDraft)
        }
      });
      nextSeq += 1;

      briefEvents.push({
        event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
        seq: nextSeq,
        ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
        round_id: roundId,
        phase: "final_decision",
        channel_id: channelId,
        agent_id: agentId,
        trace_id: traceId,
        visibility: "both",
        type: "thinking_end",
        payload: {
          text: thinkingClose
        },
        delta: null,
        meta: {
          llm_assisted: brief.source === "llm",
          provider: brief.provider,
          model: brief.model,
          debate_turn: index + 1,
          public_turn: brief.turnIndex ?? index + 1,
          agent_turn_index: brief.agentTurnIndex ?? 1,
          debate_stage: brief.stage ?? "opening",
          heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
          reply_to_agent: priorSpeaker?.agentKey ?? null,
          private_draft_used: Boolean(brief.privateDraft)
        }
      });
      nextSeq += 1;

      briefEvents.push({
        event_id: `evt_runtime_${String(nextSeq).padStart(4, "0")}`,
        seq: nextSeq,
        ts: new Date(baseMs + 3000 + briefEvents.length * 1200).toISOString(),
        round_id: roundId,
        phase: "final_decision",
        channel_id: channelId,
        agent_id: agentId,
        trace_id: traceId,
        visibility: "operator",
        type: "quote",
        payload: {
          text: brief.summary,
          source_event_ids: emittedEvents.slice(-4).map((event) => event.event_id),
          keywords: brief.keywords
        },
        delta: null,
        meta: {
          llm_assisted: brief.source === "llm",
          provider: brief.provider,
          model: brief.model,
          confidence: brief.confidence,
          risk: brief.risk,
          recommended_action: brief.recommendedAction,
          error: brief.error ?? null,
          debate_turn: index + 1,
          public_turn: brief.turnIndex ?? index + 1,
          agent_turn_index: brief.agentTurnIndex ?? 1,
          debate_stage: brief.stage ?? "opening",
          heard_from: briefs.slice(0, index).map((entry) => entry.agentKey),
          reply_to_agent: index > 0 ? briefs[index - 1]?.agentKey ?? null : null,
          private_draft_used: Boolean(brief.privateDraft)
        }
      });
    });
  }

  const operatorSeq = seqStart + briefEvents.length + 1;
  const publicSeq = operatorSeq + 1;
  const events = [phaseChange, ...briefEvents, operatorDecision, publicDecision];
  const operatorTimestamp = baseMs + 3000 + (briefEvents.length + 1) * 1400;
  const publicTimestamp = operatorTimestamp + 1800;

  events.forEach((event, index) => {
    event.round_id = roundId;
    if (typeof event.seq !== "number") {
      event.seq = seqStart + index;
    }
    if (typeof event.event_id !== "string") {
      event.event_id = `evt_runtime_${String(event.seq).padStart(4, "0")}`;
    }
    if (typeof event.ts !== "string") {
      event.ts = new Date(baseMs + 3000 + index * 1400).toISOString();
    }
    event.meta = {
      ...(event.meta ?? {}),
      runtime_engine: engineKind,
      recommended_action: recommendedAction,
      signals,
      routing_digest: routingDigest ?? {},
      model_settings_updated_at: settingsUpdatedAt ?? null,
      llm_copy_source: copySource ?? "fallback",
      llm_copy_error: copyError ?? null
    };
  });

  phaseChange.trace_id = null;
  phaseChange.seq = seqStart;
  phaseChange.event_id = `evt_runtime_${String(seqStart).padStart(4, "0")}`;
  phaseChange.ts = new Date(baseMs + 2000).toISOString();
  operatorDecision.trace_id = traceId;
  publicDecision.trace_id = traceId;
  operatorDecision.seq = operatorSeq;
  operatorDecision.event_id = `evt_runtime_${String(operatorSeq).padStart(4, "0")}`;
  operatorDecision.ts = new Date(operatorTimestamp).toISOString();
  publicDecision.seq = publicSeq;
  publicDecision.event_id = `evt_runtime_${String(publicSeq).padStart(4, "0")}`;
  publicDecision.ts = new Date(publicTimestamp).toISOString();

  operatorDecision.payload.decision = action;
  operatorDecision.payload.operator_summary = copy.operator;
  operatorDecision.payload.public_summary = copy.public;

  publicDecision.payload.decision = action;
  publicDecision.payload.operator_summary = copy.operator;
  publicDecision.payload.public_summary = copy.public;

  return events;
}

function createScriptedEngine(blueprint, getRuntimeConfig = null) {
  return {
    kind: "scripted",
    async buildDecisionEvents({ roundId, action, emittedEvents }) {
      const signals = aggregateSignals(emittedEvents);
      const recommendedAction = recommendAction(signals);
      const resolvedAction = normalizeAction(action, recommendedAction);
      const runtimeConfig =
        typeof getRuntimeConfig === "function" ? getRuntimeConfig() : null;
      const fallbackCopy = composeCopy(resolvedAction, signals, recommendedAction);
      const llmBriefing = await generateDecisionBriefing({
        roundId,
        selectedAction: resolvedAction,
        recommendedAction,
        signals,
        emittedEvents,
        fallbackCopy
      });

      return buildDecisionEvents({
        blueprint,
        roundId,
        action: resolvedAction,
        emittedEvents,
        engineKind: "scripted",
        copy: llmBriefing.copy,
        recommendedAction,
        signals,
        routingDigest: llmBriefing.routingDigest ?? runtimeConfig?.routingDigest,
        settingsUpdatedAt:
          llmBriefing.settingsUpdatedAt ?? runtimeConfig?.settingsUpdatedAt,
        briefs: llmBriefing.briefs,
        copySource: llmBriefing.copySource,
        copyError: llmBriefing.copyError
      });
    }
  };
}

async function createLangGraphEngine(blueprint, fallbackEngine, getRuntimeConfig = null) {
  const { createDecisionGraph } = require("./langgraph-core.cjs");
  const graph = createDecisionGraph({
    aggregateSignals,
    recommendAction,
    normalizeAction,
    composeCopy,
    getDefaultSignals
  });

  return {
    kind: "langgraph",
    async buildDecisionEvents({ roundId, action, emittedEvents }) {
      try {
        const result = await graph.invoke({
          requestedAction: action,
          events: emittedEvents
        });
        const runtimeConfig =
          typeof getRuntimeConfig === "function" ? getRuntimeConfig() : null;
        const fallbackCopy = {
          operator: result.operatorSummary,
          public: result.publicSummary
        };
        const llmBriefing = await generateDecisionBriefing({
          roundId,
          selectedAction: result.decision,
          recommendedAction: result.recommendedAction,
          signals: result.signals,
          emittedEvents,
          fallbackCopy
        });

        return buildDecisionEvents({
          blueprint,
          roundId,
          action: result.decision,
          emittedEvents,
          engineKind: "langgraph",
          copy: llmBriefing.copy,
          recommendedAction: result.recommendedAction,
          signals: result.signals,
          routingDigest: llmBriefing.routingDigest ?? runtimeConfig?.routingDigest,
          settingsUpdatedAt:
            llmBriefing.settingsUpdatedAt ?? runtimeConfig?.settingsUpdatedAt,
          briefs: llmBriefing.briefs,
          copySource: llmBriefing.copySource,
          copyError: llmBriefing.copyError
        });
      } catch (error) {
        console.warn(
          `[socket-runtime] LangGraph execution failed, falling back to scripted engine: ${error.message}`
        );
        return fallbackEngine.buildDecisionEvents({ roundId, action, emittedEvents });
      }
    }
  };
}

export async function createRuntimeEngine({ preferredKind, blueprint, getRuntimeConfig }) {
  const scriptedEngine = createScriptedEngine(blueprint, getRuntimeConfig);

  if (preferredKind !== "langgraph") {
    return scriptedEngine;
  }

  try {
    return await createLangGraphEngine(blueprint, scriptedEngine, getRuntimeConfig);
  } catch (error) {
    console.warn(
      `[socket-runtime] Failed to initialize LangGraph engine, using scripted engine: ${error.message}`
    );
    return scriptedEngine;
  }
}
