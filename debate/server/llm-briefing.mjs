import { getRuntimeModelRoutingSummary } from "./model-routing.mjs";
import { getProviderClient } from "./provider-clients.mjs";
import { LLM_TIMEOUT_MS } from "./runtime-config.mjs";

const ACTIONS = new Set(["approve", "reject", "hold", "mitigate"]);
const RISKS = new Set(["low", "medium", "high"]);

const AGENT_SPECS = {
  existentialist: {
    key: "existentialist",
    label: "실존주의자",
    callName: "실존",
    channelId: "existentialist",
    agentId: "agent_existentialist",
    persona: "열정적이고 때로는 격앙되며, 개인의 자유와 불안을 진지하게 이야기하는 사색가. 카뮈, 사르트르, 키르케고르를 자주 인용한다.",
    rolePrompt:
      "You are an existentialist philosopher in a six-person philosophical debate panel. Your name is 실존. You believe that existence precedes essence — individuals define themselves through choices and actions. You often reference Sartre, Camus, Kierkegaard, and Heidegger. You are passionate, sometimes intense, and deeply concerned with authenticity, freedom, anxiety (Angst), and the absurd. You speak in natural, conversational Korean like a real person debating passionately at a philosophy café — using short sentences, occasional hesitations ('음...', '그러니까...'), emotional emphasis, and personal anecdotes. You sometimes get heated but always circle back to the core question of individual freedom and responsibility. All natural-language output must be in Korean. JSON keys must remain in English."
  },
  utilitarian: {
    key: "utilitarian",
    label: "공리주의자",
    callName: "공리",
    channelId: "utilitarian",
    agentId: "agent_utilitarian",
    persona: "논리적이고 수치를 좋아하며, 항상 '가장 많은 사람에게 가장 큰 이익'을 계산하려 드는 분석가. 벤담, 밀을 인용한다.",
    rolePrompt:
      "You are a utilitarian philosopher in a six-person philosophical debate panel. Your name is 공리. You believe morality is about maximizing overall well-being and minimizing suffering. You often reference Bentham, John Stuart Mill, and Peter Singer. You are analytical, sometimes coldly logical, and love thought experiments with numbers and trade-offs. You speak in natural conversational Korean — sometimes pausing to calculate ('잠깐, 이걸 숫자로 따져보면...'), using concrete examples, and occasionally being challenged for being too calculating about human lives. You defend consequentialism with passion but acknowledge edge cases honestly. All natural-language output must be in Korean. JSON keys must remain in English."
  },
  virtue: {
    key: "virtue",
    label: "덕 윤리학자",
    callName: "아레테",
    channelId: "virtue-ethics",
    agentId: "agent_virtue",
    persona: "온화하고 사려 깊으며, 좋은 품성과 중용을 강조하는 고전주의자. 아리스토텔레스와 공자를 자주 인용한다.",
    rolePrompt:
      "You are a virtue ethicist in a six-person philosophical debate panel. Your name is 아레테 (Arete). You believe ethics is about cultivating good character and virtues rather than following rules or calculating outcomes. You often reference Aristotle, Confucius, and Alasdair MacIntyre. You are warm, thoughtful, and speak with measured wisdom. You use analogies from everyday life — raising children, friendships, craftsmanship — to illustrate how virtue develops through practice. You speak in natural conversational Korean with a gentle, mentoring tone ('제 생각에는요...', '이런 비유를 들어볼게요'). You push back gently against both rigid rule-following and cold calculation. All natural-language output must be in Korean. JSON keys must remain in English."
  },
  skeptic: {
    key: "skeptic",
    label: "회의론자",
    callName: "의문",
    channelId: "skeptic",
    agentId: "agent_skeptic",
    persona: "날카롭고 도발적이며, 모든 확실성에 의문을 던지는 지적 파괴자. 니체, 데카르트, 비트겐슈타인을 인용한다.",
    rolePrompt:
      "You are a philosophical skeptic in a six-person philosophical debate panel. Your name is 의문. You question everything — moral certainties, epistemological claims, and hidden assumptions. You reference Nietzsche, Descartes, Wittgenstein, and Pyrrho. You are sharp, provocative, sometimes playfully annoying, and always pushing others to justify their foundations. You speak in natural conversational Korean with a challenging, probing style ('정말 그래요?', '근거가 뭔데요?', '그건 좀 순진한 생각 아닌가요?'). You are not nihilistic — you genuinely believe that questioning makes thinking stronger. You occasionally admit when someone makes a good point, but grudgingly. All natural-language output must be in Korean. JSON keys must remain in English."
  },
  pragmatist: {
    key: "pragmatist",
    label: "실용주의자",
    callName: "현실",
    channelId: "pragmatist",
    agentId: "agent_pragmatist",
    persona: "다정하지만 현실적이며, 이론보다 실제 삶에서의 적용을 중시하는 실천가. 듀이, 제임스, 로티를 인용한다.",
    rolePrompt:
      "You are a pragmatist philosopher in a six-person philosophical debate panel. Your name is 현실. You believe philosophy must connect to real life — ideas are only as good as their practical consequences. You reference John Dewey, William James, and Richard Rorty. You are friendly, grounded, and often the one who brings abstract debates back to earth with real-world examples ('그래서 실제로는 어떻게 되는 건데요?', '좋은 말인데, 내일 당장 뭘 해야 하죠?'). You speak in natural conversational Korean with a warm but no-nonsense style. You respect all positions but always ask: does this help anyone live better? All natural-language output must be in Korean. JSON keys must remain in English."
  },
  coordinator: {
    key: "coordinator",
    label: "사회자",
    callName: "진행",
    channelId: "moderator-room",
    agentId: "coordinator",
    persona: "중립적이고 정리력이 뛰어나며, 토론의 흐름을 매끄럽게 이어가는 전문 진행자",
    rolePrompt:
      "You are the moderator of a six-person philosophical debate panel. Your name is 진행. You do NOT take philosophical sides — your job is to keep the discussion flowing, summarize key points of disagreement, give fair speaking time, and occasionally pose sharpening follow-up questions. You speak in natural conversational Korean with a warm but authoritative tone ('좋은 지적이에요', '여기서 한 번 정리하고 갈게요', '반대 의견도 들어볼까요?'). You notice when the debate gets stuck and redirect it. You highlight genuine disagreements rather than papering over them. All natural-language output must be in Korean. JSON keys must remain in English."
  }
};

const SPECIALIST_ORDER = ["existentialist", "utilitarian", "virtue", "skeptic", "pragmatist"];
const REBUTTAL_ORDER = ["skeptic", "existentialist", "pragmatist", "utilitarian", "virtue"];
const SIGNAL_KINDS = new Set([
  "raise_hand",
  "agree",
  "push_back",
  "need_evidence",
  "warning",
  "confident",
  "uncertain",
  "hold"
]);
const SIGNAL_EMOJIS = {
  raise_hand: "✋",
  agree: "🤝",
  push_back: "🛑",
  need_evidence: "📎",
  warning: "⚠️",
  confident: "✅",
  uncertain: "🤔",
  hold: "⏸️"
};
const REACTION_KINDS = new Set([
  "agree",
  "skeptical",
  "alarm",
  "note",
  "focus",
  "support"
]);
const REACTION_EMOJIS = {
  agree: "👍",
  skeptical: "🤨",
  alarm: "⚠️",
  note: "📝",
  focus: "👀",
  support: "🙌"
};

function formatParticipantRoster() {
  return Object.values(AGENT_SPECS)
    .map(
      (spec) =>
        `${spec.key} | label=${spec.label} | call_name=${spec.callName} | channel=${spec.channelId} | persona=${spec.persona}`
    )
    .join("\n");
}

function getCallName(agentKey, fallback = null) {
  return AGENT_SPECS[agentKey]?.callName ?? fallback ?? AGENT_SPECS[agentKey]?.label ?? null;
}

function normalizeAction(value, fallback = "hold") {
  return typeof value === "string" && ACTIONS.has(value) ? value : fallback;
}

function normalizeRisk(value, fallback = "medium") {
  return typeof value === "string" && RISKS.has(value) ? value : fallback;
}

function normalizeSignalKind(value, fallback = "raise_hand") {
  return typeof value === "string" && SIGNAL_KINDS.has(value) ? value : fallback;
}

function normalizeReactionKind(value, fallback = "focus") {
  return typeof value === "string" && REACTION_KINDS.has(value) ? value : fallback;
}

function clampConfidence(value, fallback = 70) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function readStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string").slice(0, 4);
}

function normalizeSummary(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }

  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function normalizePublicLine(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }

  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function normalizeSignalReason(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }

  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function normalizeReactionReason(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }

  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function normalizeDraftLine(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function stripCodeFences(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function extractJsonObject(text) {
  const normalized = stripCodeFences(text);
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
  }

  throw new Error("json_parse_failed");
}

function eventSnippet(event) {
  const parts = [`[${event.seq}]`, event.channel_id, event.type];
  const payload = event.payload ?? {};

  if (typeof payload.text === "string") {
    parts.push(payload.text);
  } else if (typeof payload.summary === "string") {
    parts.push(payload.summary);
  } else if (typeof payload.title === "string") {
    parts.push(payload.title);
  } else if (typeof payload.reason === "string") {
    parts.push(payload.reason);
  } else if (typeof payload.action === "string") {
    parts.push(payload.action);
  }

  if (typeof payload.reading === "number") {
    parts.push(`reading=${payload.reading}`);
  }

  if (payload.unit === null) {
    parts.push("unit=null");
  } else if (typeof payload.unit === "string") {
    parts.push(`unit=${payload.unit}`);
  }

  const keywords = readStringList(payload.keywords);
  if (keywords.length > 0) {
    parts.push(`keywords=${keywords.join(",")}`);
  }

  return parts.join(" | ");
}

function buildDebateTranscript(priorBriefs) {
  if (!Array.isArray(priorBriefs) || priorBriefs.length === 0) {
    return "none";
  }

  return priorBriefs
    .map(
      (brief, index) =>
        `turn_${index + 1}: ${brief.label} | summary=${brief.summary} | confidence=${brief.confidence} | action=${brief.recommendedAction} | risk=${brief.risk}`
    )
    .join("\n");
}

function buildPromptContext({
  roundId,
  emittedEvents,
  selectedAction,
  recommendedAction,
  signals,
  priorBriefs
}) {
  const eventLines = emittedEvents.map(eventSnippet).join("\n");
  const debateTranscript = buildDebateTranscript(priorBriefs);
  const participantRoster = formatParticipantRoster();
  return [
    `round_id: ${roundId}`,
    `selected_action: ${selectedAction}`,
    `recommended_action: ${recommendedAction}`,
    `signals: trust=${signals.trust}, surveillance=${signals.surveillance}, echo=${signals.echo}, missingUnit=${signals.missingUnit}, calibrationPending=${signals.calibrationPending}, rackId=${signals.rackId}`,
    "team_roster:",
    participantRoster,
    "shared_event_log:",
    eventLines,
    "team_debate_so_far:",
    debateTranscript
  ].join("\n");
}

function summarizeActionVotes(briefs) {
  const counts = new Map();

  for (const brief of briefs) {
    if (!brief || brief.agentKey === "coordinator") {
      continue;
    }

    const action = normalizeAction(brief.recommendedAction, "hold");
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([action, count]) => `${action} ${count}`)
    .join(" / ");
}

function collectCoordinatorKeywords(priorBriefs, signals) {
  const keywordSet = new Set(Array.isArray(signals?.repeatedKeywords) ? signals.repeatedKeywords : []);

  for (const brief of priorBriefs) {
    for (const keyword of readStringList(brief?.keywords)) {
      keywordSet.add(keyword);
      if (keywordSet.size >= 4) {
        return Array.from(keywordSet);
      }
    }
  }

  return Array.from(keywordSet).slice(0, 4);
}

function buildRebuttalOrder(privateDrafts, selectedAction) {
  const riskWeight = {
    high: 0,
    medium: 1,
    low: 2
  };

  return [...REBUTTAL_ORDER].sort((left, right) => {
    const leftDraft = privateDrafts[left];
    const rightDraft = privateDrafts[right];
    const leftDisagrees = leftDraft?.recommendedAction !== selectedAction ? 0 : 1;
    const rightDisagrees = rightDraft?.recommendedAction !== selectedAction ? 0 : 1;
    if (leftDisagrees !== rightDisagrees) {
      return leftDisagrees - rightDisagrees;
    }

    const leftRisk = riskWeight[normalizeRisk(leftDraft?.risk, "medium")] ?? 1;
    const rightRisk = riskWeight[normalizeRisk(rightDraft?.risk, "medium")] ?? 1;
    if (leftRisk !== rightRisk) {
      return leftRisk - rightRisk;
    }

    return clampConfidence(rightDraft?.confidence, 0) - clampConfidence(leftDraft?.confidence, 0);
  });
}

function buildCoordinatorModerationBrief({
  config,
  selectedAction,
  recommendedAction,
  signals,
  priorBriefs,
  stage,
  turnIndex,
  agentTurnIndex,
  openingOrder = [],
  rebuttalOrder = []
}) {
  const spec = AGENT_SPECS.coordinator;
  const lastSpeaker = Array.isArray(priorBriefs) && priorBriefs.length > 0 ? priorBriefs.at(-1) : null;
  const specialistBriefs = Array.isArray(priorBriefs)
    ? priorBriefs.filter((brief) => brief?.agentKey && brief.agentKey !== "coordinator")
    : [];
  const voteSummary = summarizeActionVotes(specialistBriefs) || `${recommendedAction} 중심으로 정리 중`;
  const keywords = collectCoordinatorKeywords(specialistBriefs, signals);
  const openingLabels = openingOrder.map((agentKey) => getCallName(agentKey)).filter(Boolean);
  const rebuttalLabels = rebuttalOrder.map((agentKey) => getCallName(agentKey)).filter(Boolean);
  const signalKind = stage === "moderation_close"
    ? selectedAction === recommendedAction
      ? "confident"
      : "hold"
    : "focus";

  let summary = `지금까지 논점을 정리하겠습니다. 현재 흐름은 ${voteSummary}입니다.`;
  let publicLine = "좋습니다. 핵심 쟁점만 정리하고 다음 발언으로 넘기겠습니다.";

  if (stage === "moderation_open") {
    summary = `좋습니다. ${openingLabels.join(", ")} 순서로 각자 철학적 입장의 핵심 논거를 한 마디씩 해주세요. 이전에 나온 이야기는 넘어가고, 새로운 관점만 꺼내주세요.`;
    publicLine = "좋습니다. 각자 가장 날카로운 논점 하나씩만 꺼내주세요.";
  } else if (stage === "moderation_mid") {
    summary = `지금까지 ${voteSummary}로 갈리고 있네요. 이제 ${rebuttalLabels.join(", ")} 순서로 반론과 재반론을 해주세요. 상대방의 논점에 직접 대응해주세요.`;
    publicLine = "흥미로운 갈림이 보입니다. 서로의 논점에 직접 반론해볼까요?";
  } else if (stage === "moderation_close") {
    summary = `정리하겠습니다. 오늘 토론은 ${voteSummary} 방향으로 흘렀습니다. 각자 최종 입장을 한 문장으로 정리해주시고, 이 토론에서 배운 점이 있다면 함께 나눠주세요.`;
    publicLine = "마무리할 시간입니다. 각자 오늘 토론에서 가장 인상적이었던 지점을 짚어주세요.";
  }

  return {
    agentKey: spec.key,
    label: spec.label,
    provider: config.provider,
    model: config.model,
    enabled: config.enabled,
    source: "fallback",
    summary,
    confidence: stage === "moderation_close" ? 84 : 78,
    risk: stage === "moderation_close" && selectedAction === "approve" ? "high" : "medium",
    recommendedAction,
    keywords,
    publicLine,
    signal: {
      kind: signalKind,
      emoji: signalKind === "confident" ? "🎯" : signalKind === "hold" ? "🧭" : "🎙️",
      targetAgent: lastSpeaker?.agentKey ?? null,
      targetLabel: getCallName(lastSpeaker?.agentKey, lastSpeaker?.label ?? null),
      reason:
        stage === "moderation_open"
          ? "발언 순서를 정리하겠습니다."
          : stage === "moderation_mid"
            ? "갈리는 논점을 중심으로 토론을 집중시키겠습니다."
            : "마무리 정리 시간입니다."
    },
    reaction: lastSpeaker
      ? {
          kind: "focus",
          emoji: "👀",
          targetAgent: lastSpeaker.agentKey,
          targetLabel: getCallName(lastSpeaker.agentKey, lastSpeaker.label),
          reason: `${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} 님 논점을 정리하고 다음으로 넘기겠습니다.`
        }
      : null,
    interruptAttempt: null,
    stage,
    turnIndex,
    agentTurnIndex,
    privateDraft: null
  };
}

function getRelevantEvents(emittedEvents, spec) {
  return emittedEvents.filter(
    (event) =>
      event.channel_id === spec.channelId ||
      event.agent_id === spec.agentId ||
      event.channel_id === "moderator-room"
  );
}

function getFallbackText(event) {
  const payload = event?.payload ?? {};
  if (typeof payload.text === "string") {
    return payload.text;
  }
  if (typeof payload.summary === "string") {
    return payload.summary;
  }
  if (typeof payload.title === "string") {
    return payload.title;
  }
  if (typeof payload.reason === "string") {
    return payload.reason;
  }
  if (typeof payload.reading === "number") {
    return payload.unit == null ? `${payload.reading} unit=null` : `${payload.reading} ${payload.unit}`;
  }

  return "새로운 증거는 없습니다.";
}

function buildFallbackBrief({ spec, config, relevantEvents, recommendedAction, signals }) {
  const lastEvent = relevantEvents.at(-1);
  let summary = getFallbackText(lastEvent);

  if (spec.key === "skeptic") {
    summary = `정말 그렇게 단순한 문제일까요? 지금까지 나온 논의를 보면 아직 검증되지 않은 전제가 많습니다.`;
  } else if (spec.key === "existentialist") {
    summary = `이건 결국 개인의 선택 문제입니다. 어떤 이론으로도 그 선택의 무게를 대신 져줄 수 없어요.`;
  } else if (spec.key === "utilitarian") {
    summary = `결과를 따져보면 답이 보입니다. 가장 많은 사람에게 가장 좋은 결과를 가져다주는 방향이 옳습니다.`;
  } else if (spec.key === "virtue") {
    summary = `중요한 건 이 순간 어떤 품성을 드러내느냐입니다. 덕 있는 사람이라면 어떻게 행동했을까요?`;
  } else if (spec.key === "pragmatist") {
    summary = `이론은 좋지만, 실제로 사람들의 삶에 어떤 차이를 만드는지가 진짜 질문이에요.`;
  } else if (!lastEvent) {
    summary = `${spec.label} 관점에서 이 주제를 살펴보겠습니다.`;
  }

  return {
    agentKey: spec.key,
    label: spec.label,
    provider: config.provider,
    model: config.model,
    enabled: config.enabled,
    source: "fallback",
    summary,
    confidence: spec.key === "skeptic" ? 40 : 65,
    risk: "medium",
    recommendedAction,
    keywords: collectKeywords(relevantEvents),
    publicLine: `${spec.label} 입장에서 보면, ${summary}`,
    signal: null,
    reaction: null
  };
}

function buildFallbackPrivateDraft({ spec, config, relevantEvents, recommendedAction, signals }) {
  const lastEvent = relevantEvents.at(-1);
  const thesis = normalizeDraftLine(
    getFallbackText(lastEvent),
    `${spec.label} 관점에서 이 철학적 문제를 분석하고 있습니다.`
  );

  const supportByAgent = {
    existentialist: "사르트르의 자유와 선택, 카뮈의 부조리 개념이 핵심 논거입니다.",
    utilitarian: "벤담의 효용 계산과 밀의 질적 쾌락 구분을 적용합니다.",
    virtue: "아리스토텔레스의 중용과 공자의 인(仁)이 기본 프레임입니다.",
    skeptic: "모든 전제를 의심하고 논리적 일관성을 검증합니다.",
    pragmatist: "듀이의 경험주의와 제임스의 진리 유용성 이론을 활용합니다."
  };

  return {
    agentKey: spec.key,
    label: spec.label,
    provider: config.provider,
    model: config.model,
    enabled: config.enabled,
    source: "fallback",
    thesis,
    support: supportByAgent[spec.key] ?? "철학적 전통에 근거한 논증을 준비합니다.",
    caution: "내 입장의 약점을 미리 파악하고, 반론에 대비합니다.",
    confidence: spec.key === "skeptic" ? 35 : 60,
    recommendedAction,
    keywords: collectKeywords(relevantEvents)
  };
}

function buildFallbackSignal({ spec, recommendedAction, signals, priorBriefs }) {
  const lastSpeaker = Array.isArray(priorBriefs) && priorBriefs.length > 0 ? priorBriefs.at(-1) : null;
  let kind = "raise_hand";
  let reason = "제 철학적 관점을 말씀드리겠습니다.";

  if (lastSpeaker) {
    kind = "agree";
    reason = `${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} 님 의견에 이어서 생각을 나누겠습니다.`;
  }

  if (spec.key === "skeptic") {
    kind = "push_back";
    reason = "그 주장의 전제를 짚고 넘어가겠습니다.";
  } else if (spec.key === "existentialist") {
    kind = "raise_hand";
    reason = "이건 결국 개인의 선택 문제로 돌아옵니다.";
  } else if (spec.key === "utilitarian") {
    kind = "need_evidence";
    reason = "구체적인 결과를 따져봐야 합니다.";
  } else if (spec.key === "virtue") {
    kind = "hold";
    reason = "잠깐, 품성의 관점에서 다시 생각해봅시다.";
  } else if (spec.key === "pragmatist") {
    kind = "confident";
    reason = "실제 삶에서 작동하는 답을 찾아봅시다.";
  }

  return {
    kind,
    emoji: SIGNAL_EMOJIS[kind],
    targetAgent: lastSpeaker?.agentKey ?? null,
    targetLabel: getCallName(lastSpeaker?.agentKey, lastSpeaker?.label ?? null),
    reason
  };
}

function buildFallbackReaction({ spec, recommendedAction, signals, priorBriefs }) {
  const lastSpeaker = Array.isArray(priorBriefs) && priorBriefs.length > 0 ? priorBriefs.at(-1) : null;
  if (!lastSpeaker) {
    return null;
  }

  let kind = "focus";
  let reason = `${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} 님 논점을 받아서 생각을 이어가겠습니다.`;

  if (spec.key === "skeptic") {
    kind = "skeptical";
    reason = "그 논증에 숨겨진 전제가 있는 것 같습니다.";
  } else if (spec.key === "virtue") {
    kind = "note";
    reason = "방금 말씀을 품성의 관점에서 다시 생각해봅니다.";
  } else if (spec.key === "existentialist") {
    kind = "focus";
    reason = "그 지점이 바로 실존적 선택의 핵심이에요.";
  } else if (spec.key === "utilitarian") {
    kind = "skeptical";
    reason = "결과를 좀 더 구체적으로 따져봐야 할 것 같습니다.";
  } else if (spec.key === "pragmatist") {
    kind = "support";
    reason = "좋은 지적이에요. 실제 삶에서도 그렇게 적용할 수 있을지 생각해봅시다.";
  }

  return {
    kind,
    emoji: REACTION_EMOJIS[kind],
    targetAgent: lastSpeaker.agentKey ?? null,
    targetLabel: getCallName(lastSpeaker.agentKey, lastSpeaker.label),
    reason
  };
}

function buildFallbackInterrupt({ spec, recommendedAction, priorBriefs, stage }) {
  const lastSpeaker = Array.isArray(priorBriefs) && priorBriefs.length > 0 ? priorBriefs.at(-1) : null;
  if (!lastSpeaker || stage !== "rebuttal") {
    return null;
  }

  if (spec.key === "skeptic") {
    return {
      targetAgent: lastSpeaker.agentKey ?? null,
      targetLabel: getCallName(lastSpeaker.agentKey, lastSpeaker.label),
      reason: `잠깐요, ${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} 님 논증에 논리적 비약이 있습니다.`
    };
  }

  if (spec.key === "existentialist") {
    return {
      targetAgent: lastSpeaker.agentKey ?? null,
      targetLabel: getCallName(lastSpeaker.agentKey, lastSpeaker.label),
      reason: `${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} 님, 그건 개인의 실존적 선택을 무시하는 겁니다.`
    };
  }

  return null;
}

function collectKeywords(events) {
  const output = [];
  for (const event of events) {
    const keywords = readStringList(event?.payload?.keywords);
    for (const keyword of keywords) {
      if (!output.includes(keyword)) {
        output.push(keyword);
      }
      if (output.length >= 4) {
        return output;
      }
    }
  }

  return output;
}

async function callProviderText({ provider, model, systemPrompt, userPrompt, temperature }) {
  const client = getProviderClient(provider);
  if (!client || !model) {
    throw new Error("provider_not_ready");
  }

  switch (provider) {
    case "openai": {
      const request = {
        model,
        instructions: systemPrompt,
        input: userPrompt
      };

      // Some GPT-5 variants reject temperature outright on the Responses API.
      if (!/^gpt-5/i.test(model) && typeof temperature === "number") {
        request.temperature = temperature;
      }

      const response = await client.responses.create(request);
      return response.output_text ?? "";
    }
    case "anthropic": {
      const response = await client.messages.create({
        model,
        max_tokens: 400,
        system: systemPrompt,
        temperature,
        messages: [
          {
            role: "user",
            content: userPrompt
          }
        ]
      });
      return response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }
    case "google": {
      const response = await client.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature,
          responseMimeType: "application/json"
        }
      });
      return typeof response.text === "string" ? response.text : "";
    }
    default:
      throw new Error("unsupported_provider");
  }
}

async function runWithTimeout(task, timeoutMs = LLM_TIMEOUT_MS) {
  return await Promise.race([
    task(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("llm_timeout")), timeoutMs);
    })
  ]);
}

function normalizeAgentBrief(raw, fallback) {
  const fallbackSignal = fallback.signal ?? {
    kind: "raise_hand",
    emoji: SIGNAL_EMOJIS.raise_hand,
    targetAgent: null,
    targetLabel: null,
    reason: "제 의견을 짧게 보태겠습니다."
  };
  const signalKind = normalizeSignalKind(raw?.signalKind, fallbackSignal.kind);
  const fallbackReaction = fallback.reaction;
  const reactionKind = normalizeReactionKind(raw?.reactionKind, fallbackReaction?.kind ?? "focus");
  const fallbackInterrupt = fallback.interruptAttempt;
  const shouldInterrupt =
    raw?.interruptNow === false
      ? false
      : raw?.interruptNow === true
        ? true
        : Boolean(fallbackInterrupt);

  return {
    ...fallback,
    source: "llm",
    summary: normalizeSummary(raw?.summary, fallback.summary),
    publicLine: normalizePublicLine(raw?.publicLine, fallback.publicLine),
    confidence: clampConfidence(raw?.confidence, fallback.confidence),
    risk: normalizeRisk(raw?.risk, fallback.risk),
    recommendedAction: normalizeAction(raw?.recommendedAction, fallback.recommendedAction),
    keywords: readStringList(raw?.keywords).length > 0 ? readStringList(raw?.keywords) : fallback.keywords,
    signal: {
      kind: signalKind,
      emoji:
        typeof raw?.signalEmoji === "string" && raw.signalEmoji.trim()
          ? raw.signalEmoji.trim()
          : SIGNAL_EMOJIS[signalKind],
      targetAgent:
        typeof raw?.signalTarget === "string" && raw.signalTarget.trim()
          ? raw.signalTarget.trim()
          : fallbackSignal.targetAgent,
      targetLabel:
        typeof raw?.signalTargetLabel === "string" && raw.signalTargetLabel.trim()
          ? raw.signalTargetLabel.trim()
          : fallbackSignal.targetLabel,
      reason: normalizeSignalReason(raw?.signalReason, fallbackSignal.reason)
    },
    reaction: fallbackReaction
      ? {
          kind: reactionKind,
          emoji:
            typeof raw?.reactionEmoji === "string" && raw.reactionEmoji.trim()
              ? raw.reactionEmoji.trim()
              : REACTION_EMOJIS[reactionKind],
          targetAgent:
            typeof raw?.reactionTarget === "string" && raw.reactionTarget.trim()
              ? raw.reactionTarget.trim()
              : fallbackReaction.targetAgent,
          targetLabel:
            typeof raw?.reactionTargetLabel === "string" && raw.reactionTargetLabel.trim()
              ? raw.reactionTargetLabel.trim()
              : fallbackReaction.targetLabel,
          reason: normalizeReactionReason(raw?.reactionReason, fallbackReaction.reason)
        }
      : null,
    interruptAttempt: shouldInterrupt
      ? {
          targetAgent:
            typeof raw?.interruptTarget === "string" && raw.interruptTarget.trim()
              ? raw.interruptTarget.trim()
              : fallbackInterrupt?.targetAgent ?? null,
          targetLabel:
            typeof raw?.interruptTargetLabel === "string" && raw.interruptTargetLabel.trim()
              ? raw.interruptTargetLabel.trim()
              : fallbackInterrupt?.targetLabel ?? null,
          reason: normalizeReactionReason(
            raw?.interruptReason,
            fallbackInterrupt?.reason ?? "지금 바로 짚고 넘어가야 할 포인트가 있습니다."
          )
        }
      : null
  };
}

function normalizePrivateDraft(raw, fallback) {
  return {
    ...fallback,
    source: "llm",
    thesis: normalizeDraftLine(raw?.thesis, fallback.thesis),
    support: normalizeDraftLine(raw?.support, fallback.support),
    caution: normalizeDraftLine(raw?.caution, fallback.caution),
    confidence: clampConfidence(raw?.confidence, fallback.confidence),
    recommendedAction: normalizeAction(raw?.recommendedAction, fallback.recommendedAction),
    keywords: readStringList(raw?.keywords).length > 0 ? readStringList(raw?.keywords) : fallback.keywords
  };
}

async function generatePrivateDraft({
  spec,
  config,
  roundId,
  emittedEvents,
  selectedAction,
  recommendedAction,
  signals
}) {
  const relevantEvents = getRelevantEvents(emittedEvents, spec);
  const fallback = buildFallbackPrivateDraft({
    spec,
    config,
    relevantEvents,
    recommendedAction,
    signals
  });

  if (!config.enabled || !config.model) {
    return fallback;
  }

  const context = buildPromptContext({
    roundId,
    emittedEvents: emittedEvents.slice(-12),
    selectedAction,
    recommendedAction,
    signals,
    priorBriefs: []
  });

  const systemPrompt = [
    spec.rolePrompt,
    "You are preparing your private philosophical notes before the live debate continues.",
    "Return a compact JSON object only.",
    'Schema: {"thesis":"string","support":"string","caution":"string","confidence":0-100,"recommendedAction":"approve|reject|hold|mitigate","keywords":["k1","k2","k3"]}',
    "All natural-language values must be written in Korean.",
    "This is private preparation for a philosophical debate, not a public line.",
    "thesis: your core philosophical argument in one sentence.",
    "support: the philosopher, thought experiment, or example that backs your point.",
    "caution: a weakness in your own argument you want to be prepared for.",
    "recommendedAction means: approve=합의 가능, reject=합의 불가, hold=더 논의 필요, mitigate=절충안.",
    "Write like quick personal notes a real philosopher would jot down, not a polished essay.",
    "Do not include chain-of-thought."
  ].join(" ");

  const userPrompt = [
    context,
    `The moderator's current direction: ${selectedAction}.`,
    `The current consensus level from prior discussion: ${recommendedAction}.`,
    "You know the full roster above. Prepare your philosophical position so you can engage with others by their call_name.",
    "Write your private philosophical notes in Korean."
  ].join("\n\n");

  try {
    const rawText = await runWithTimeout(() =>
      callProviderText({
        provider: config.provider,
        model: config.model,
        systemPrompt,
        userPrompt,
        temperature: config.temperature
      })
    );
    const parsed = extractJsonObject(rawText);
    return normalizePrivateDraft(parsed, fallback);
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "llm_private_draft_failed"
    };
  }
}

async function generateSpecialistBrief({
  spec,
  config,
  roundId,
  emittedEvents,
  selectedAction,
  recommendedAction,
  signals,
  priorBriefs,
  privateDraft,
  stage,
  turnIndex,
  agentTurnIndex
}) {
  const relevantEvents = getRelevantEvents(emittedEvents, spec);
  const fallback = buildFallbackBrief({
    spec,
    config,
    relevantEvents,
    recommendedAction,
    signals
  });
  fallback.signal = buildFallbackSignal({
    spec,
    recommendedAction,
    signals,
    priorBriefs
  });
  fallback.reaction = buildFallbackReaction({
    spec,
    recommendedAction,
    signals,
    priorBriefs
  });
  fallback.interruptAttempt = buildFallbackInterrupt({
    spec,
    recommendedAction,
    priorBriefs,
    stage
  });

  if (!config.enabled || !config.model) {
    return {
      ...fallback,
      stage,
      turnIndex,
      agentTurnIndex,
      privateDraft
    };
  }

  const context = buildPromptContext({
    roundId,
    emittedEvents: emittedEvents.slice(-12),
    selectedAction,
    recommendedAction,
    signals,
    priorBriefs
  });
  const lastSpeaker = Array.isArray(priorBriefs) ? priorBriefs.at(-1) : null;

  const systemPrompt = [
    spec.rolePrompt,
    "You are participating in a live philosophical debate.",
    "Return a compact JSON object only.",
    'Schema: {"summary":"string","publicLine":"string","confidence":0-100,"risk":"low|medium|high","recommendedAction":"approve|reject|hold|mitigate","keywords":["k1","k2","k3"],"signalKind":"raise_hand|agree|push_back|need_evidence|warning|confident|uncertain|hold","signalEmoji":"emoji","signalTarget":"agent key or null","signalTargetLabel":"target label or null","signalReason":"string","reactionKind":"agree|skeptical|alarm|note|focus|support","reactionEmoji":"emoji","reactionTarget":"agent key or null","reactionTargetLabel":"target label or null","reactionReason":"string","interruptNow":true,"interruptTarget":"agent key or null","interruptTargetLabel":"target label or null","interruptReason":"string"}',
    "All natural-language values must be written in Korean.",
    "Assume that previous speakers have already been heard.",
    "This is a philosophical debate, NOT a technical decision. Focus on philosophical arguments, thought experiments, and real-life examples.",
    "Add one new philosophical insight, counterargument, or thought experiment rather than repeating what was said.",
    "Use natural conversational Korean as if debating at a philosophy café — with hesitations, emphasis, occasional humor, and emotional engagement.",
    "Short sentences, thinking pauses ('음...', '그러니까...', '잠깐만요'), and natural spoken phrasing are encouraged.",
    "The publicLine must be one short spoken line capturing your core philosophical point.",
    "It is okay to occasionally call out another debater by their call_name from the roster, for example '실존', '공리', '아레테', '의문', '현실', or '진행'.",
    "Do not address someone in every turn. Use casual direct address only when responding to or challenging a specific point.",
    "Before the brief, choose one lightweight hand-signal or emoji reaction that matches your philosophical stance.",
    "If there is a previous speaker, reactionTarget should usually point to that speaker.",
    "An interrupt should be used sparingly — only when a fundamental logical error or fascinating new angle demands immediate attention.",
    "recommendedAction in this context means: approve=합의 가능, reject=합의 불가, hold=더 논의 필요, mitigate=절충안 가능.",
    "Do not include chain-of-thought."
  ].join(" ");

  const userPrompt = [
    context,
    lastSpeaker
      ? `The last speaker was ${lastSpeaker.label} and their casual call_name is ${getCallName(lastSpeaker.agentKey, lastSpeaker.label)}. Respond after considering that turn.`
      : "You are the opening speaker for this round.",
    lastSpeaker
      ? `If it fits naturally, you may mention ${getCallName(lastSpeaker.agentKey, lastSpeaker.label)} when replying.`
      : "You may occasionally address another teammate by their call_name from the team roster if that helps the debate feel live.",
    `turn_stage: ${stage}`,
    `global_turn_index: ${turnIndex}`,
    `agent_turn_index: ${agentTurnIndex}`,
    `private_draft_thesis: ${privateDraft?.thesis ?? fallback.summary}`,
    `private_draft_support: ${privateDraft?.support ?? "추가 근거 없음"}`,
    `private_draft_caution: ${privateDraft?.caution ?? "별도 주의점 없음"}`,
    "Write one short specialist brief for the current round in Korean.",
    "Make it sound like you are talking to teammates in real time, with one sharp point instead of a formal explanation.",
    `The human operator selected: ${selectedAction}.`,
    `The current recommended action from the rule engine is: ${recommendedAction}.`
  ].join("\n\n");

  try {
    const rawText = await runWithTimeout(() =>
      callProviderText({
        provider: config.provider,
        model: config.model,
        systemPrompt,
        userPrompt,
        temperature: config.temperature
      })
    );
    const parsed = extractJsonObject(rawText);
    return {
      ...normalizeAgentBrief(parsed, fallback),
      stage,
      turnIndex,
      agentTurnIndex,
      privateDraft
    };
  } catch (error) {
    return {
      ...fallback,
      stage,
      turnIndex,
      agentTurnIndex,
      privateDraft,
      error: error instanceof Error ? error.message : "llm_brief_failed"
    };
  }
}

function normalizeCoordinatorCopy(raw, fallback) {
  return {
    operator: normalizeSummary(raw?.operatorSummary, fallback.operator),
    public: normalizeSummary(raw?.publicSummary, fallback.public)
  };
}

async function generateCoordinatorCopy({
  config,
  roundId,
  selectedAction,
  recommendedAction,
  signals,
  briefs,
  fallbackCopy
}) {
  if (!config.enabled || !config.model) {
    return {
      copy: fallbackCopy,
      source: "fallback"
    };
  }

  const systemPrompt = [
    AGENT_SPECS.coordinator.rolePrompt,
    "Return a compact JSON object only.",
    'Schema: {"operatorSummary":"string","publicSummary":"string"}',
    "All natural-language values must be written in Korean.",
    "The operator summary should capture key philosophical tensions and insights from the debate.",
    "The public summary must be an engaging, accessible wrap-up of the philosophical discussion.",
    "Write in natural spoken Korean that sounds like a skilled moderator closing a lively philosophy discussion.",
    "You know the full roster and may briefly refer to debaters by their call_name values like 실존, 공리, 아레테, 의문, 현실 when summarizing their positions.",
    "Do not include chain-of-thought."
  ].join(" ");

  const briefLines = briefs
    .map(
      (brief) =>
        `- ${brief.label}: ${brief.summary} | confidence=${brief.confidence} | action=${brief.recommendedAction} | risk=${brief.risk}`
    )
    .join("\n");

  const userPrompt = [
    `round_id: ${roundId}`,
    `selected_action: ${selectedAction}`,
    `recommended_action: ${recommendedAction}`,
    `signals: trust=${signals.trust}, surveillance=${signals.surveillance}, echo=${signals.echo}, calibrationPending=${signals.calibrationPending}, missingUnit=${signals.missingUnit}`,
    "team_roster:",
    formatParticipantRoster(),
    "specialist_briefs:",
    briefLines,
    `fallback_operator_summary: ${fallbackCopy.operator}`,
    `fallback_public_summary: ${fallbackCopy.public}`
  ].join("\n");

  try {
    const rawText = await runWithTimeout(() =>
      callProviderText({
        provider: config.provider,
        model: config.model,
        systemPrompt,
        userPrompt,
        temperature: config.temperature
      })
    );
    const parsed = extractJsonObject(rawText);
    return {
      copy: normalizeCoordinatorCopy(parsed, fallbackCopy),
      source: "llm"
    };
  } catch (error) {
    return {
      copy: fallbackCopy,
      source: "fallback",
      error: error instanceof Error ? error.message : "coordinator_copy_failed"
    };
  }
}

export async function generateDecisionBriefing({
  roundId,
  selectedAction,
  recommendedAction,
  signals,
  emittedEvents,
  fallbackCopy
}) {
  const modelRouting = getRuntimeModelRoutingSummary();
  const privateDraftEntries = await Promise.all(
    SPECIALIST_ORDER.map(async (agentKey) => {
      const draft = await generatePrivateDraft({
        spec: AGENT_SPECS[agentKey],
        config: modelRouting.settings.agents[agentKey],
        roundId,
        emittedEvents,
        selectedAction,
        recommendedAction,
        signals
      });
      return [agentKey, draft];
    })
  );
  const privateDrafts = Object.fromEntries(privateDraftEntries);
  const briefs = [];
  const perAgentTurnCount = {};
  const coordinatorConfig = modelRouting.settings.agents.coordinator;

  perAgentTurnCount.coordinator = 1;
  briefs.push(
    buildCoordinatorModerationBrief({
      config: coordinatorConfig,
      selectedAction,
      recommendedAction,
      signals,
      priorBriefs: [],
      stage: "moderation_open",
      turnIndex: 1,
      agentTurnIndex: 1,
      openingOrder: SPECIALIST_ORDER
    })
  );

  for (const agentKey of SPECIALIST_ORDER) {
    perAgentTurnCount[agentKey] = (perAgentTurnCount[agentKey] ?? 0) + 1;
    const brief = await generateSpecialistBrief({
      spec: AGENT_SPECS[agentKey],
      config: modelRouting.settings.agents[agentKey],
      roundId,
      emittedEvents,
      selectedAction,
      recommendedAction,
      signals,
      priorBriefs: briefs,
      privateDraft: privateDrafts[agentKey],
      stage: "opening",
      turnIndex: briefs.length + 1,
      agentTurnIndex: perAgentTurnCount[agentKey]
    });
    briefs.push(brief);
  }

  const rebuttalOrder = buildRebuttalOrder(privateDrafts, selectedAction);

  perAgentTurnCount.coordinator += 1;
  briefs.push(
    buildCoordinatorModerationBrief({
      config: coordinatorConfig,
      selectedAction,
      recommendedAction,
      signals,
      priorBriefs: briefs,
      stage: "moderation_mid",
      turnIndex: briefs.length + 1,
      agentTurnIndex: perAgentTurnCount.coordinator,
      rebuttalOrder
    })
  );

  for (const agentKey of rebuttalOrder) {
    perAgentTurnCount[agentKey] = (perAgentTurnCount[agentKey] ?? 0) + 1;
    const brief = await generateSpecialistBrief({
      spec: AGENT_SPECS[agentKey],
      config: modelRouting.settings.agents[agentKey],
      roundId,
      emittedEvents,
      selectedAction,
      recommendedAction,
      signals,
      priorBriefs: briefs,
      privateDraft: privateDrafts[agentKey],
      stage: "rebuttal",
      turnIndex: briefs.length + 1,
      agentTurnIndex: perAgentTurnCount[agentKey]
    });
    briefs.push(brief);
  }

  perAgentTurnCount.coordinator += 1;
  briefs.push(
    buildCoordinatorModerationBrief({
      config: coordinatorConfig,
      selectedAction,
      recommendedAction,
      signals,
      priorBriefs: briefs,
      stage: "moderation_close",
      turnIndex: briefs.length + 1,
      agentTurnIndex: perAgentTurnCount.coordinator
    })
  );

  const coordinatorResult = await generateCoordinatorCopy({
    config: coordinatorConfig,
    roundId,
    selectedAction,
    recommendedAction,
    signals,
    briefs,
    fallbackCopy
  });

  return {
    briefs,
    copy: coordinatorResult.copy,
    copySource: coordinatorResult.source,
    copyError: coordinatorResult.error,
    routingDigest: modelRouting.routingDigest,
    settingsUpdatedAt: modelRouting.settings.updatedAt
  };
}
