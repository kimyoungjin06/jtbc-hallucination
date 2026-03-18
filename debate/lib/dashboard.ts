import type {
  ChannelConfig,
  ChannelSnapshot,
  DashboardEvent,
  DashboardSnapshot,
  EventPresentation,
  Phase,
  ViewMode
} from "@/lib/types";

export const CHANNELS: ChannelConfig[] = [
  { id: "moderator-room", label: "#사회자석", group: "core", hue: "8 86% 58%" },
  { id: "existentialist", label: "#실존주의", group: "specialist", hue: "280 72% 58%" },
  { id: "utilitarian", label: "#공리주의", group: "specialist", hue: "43 92% 56%" },
  { id: "virtue-ethics", label: "#덕윤리", group: "specialist", hue: "143 60% 45%" },
  { id: "skeptic", label: "#회의론", group: "specialist", hue: "351 83% 58%" },
  { id: "pragmatist", label: "#실용주의", group: "specialist", hue: "188 78% 46%" },
  { id: "public-briefing", label: "#공개토론장", group: "public", hue: "201 80% 55%" }
];

export const PHASE_LABELS: Record<Phase, string> = {
  idle: "대기",
  official_statement: "주제 제시",
  chaos_time: "자유 토론",
  interrupt: "논점 전환",
  final_decision: "결론 정리"
};

export const VIEW_LABELS: Record<ViewMode, string> = {
  operator: "운영자 콘솔",
  audience: "관객 피드",
  tv: "TV 모드",
  replay: "리플레이 콘솔"
};

const AGENT_LABELS: Record<string, string> = {
  coordinator: "사회자",
  agent_existentialist: "실존주의자",
  agent_utilitarian: "공리주의자",
  agent_virtue: "덕 윤리학자",
  agent_skeptic: "회의론자",
  agent_pragmatist: "실용주의자"
};

const AGENT_AVATARS: Record<string, string> = {
  coordinator: "MC",
  agent_existentialist: "실",
  agent_utilitarian: "공",
  agent_virtue: "덕",
  agent_skeptic: "회",
  agent_pragmatist: "용"
};

const DECISION_LABELS: Record<string, string> = {
  approve: "합의 도달",
  reject: "합의 불발",
  hold: "논의 계속",
  mitigate: "절충안 채택"
};

const SIGNAL_LABELS: Record<string, string> = {
  raise_hand: "손들기",
  agree: "동의",
  push_back: "반박",
  need_evidence: "근거 요청",
  warning: "경고",
  confident: "확신",
  uncertain: "불확실",
  hold: "잠깐"
};

const REACTION_LABELS: Record<string, string> = {
  agree: "공감",
  skeptical: "의문",
  alarm: "경계",
  note: "메모",
  focus: "집중",
  support: "지원"
};

export function formatClock(ts: string): string {
  const date = new Date(ts);
  return date.toISOString().slice(11, 19);
}

export function buildSnapshot(events: DashboardEvent[], mode: ViewMode): DashboardSnapshot {
  const channels = new Map<string, ChannelSnapshot>();
  let currentPhase: Phase = "idle";
  let trust = 84;
  let surveillance = 0;
  let echo = 0;
  let latestDecision: DashboardEvent | null = null;
  let pendingInterrupt: DashboardEvent | null = null;
  let activeTraceId: string | null = null;
  const timeline: DashboardEvent[] = [];
  const trace: DashboardEvent[] = [];
  const keywords: string[] = [];

  for (const config of CHANNELS) {
    channels.set(config.id, {
      id: config.id,
      label: config.label,
      group: config.group,
      hue: config.hue,
      trust: 50,
      surveillance: 0,
      echo: 0,
      unread: 0,
      lastEventType: null,
      lastSummary: "No activity yet",
      lastSeq: 0,
      interruptPending: false
    });
  }

  for (const event of events) {
    const visibleToMode = isVisibleForMode(mode, event);

    if (event.type === "phase_change") {
      const nextPhase = event.payload.to;
      if (typeof nextPhase === "string") {
        currentPhase = nextPhase as Phase;
      }
    }

    if (visibleToMode && event.trace_id) {
      activeTraceId = event.trace_id;
    }

    const channel = channels.get(event.channel_id);
    const countsAsVisibleChannelBeat =
      event.type !== "thinking_start" &&
      event.type !== "thinking_end" &&
      event.type !== "speech_start" &&
      event.type !== "speech_chunk";

    if (channel && visibleToMode && countsAsVisibleChannelBeat) {
      channel.unread += 1;
      channel.lastEventType = event.type;
      channel.lastSeq = event.seq;
      channel.lastSummary = describeEvent(event, mode).title;
    }

    if (event.delta) {
      trust = clamp(trust + event.delta.trust * 100, 0, 100);
      surveillance = clamp(surveillance + event.delta.surveillance, 0, 3);
      echo = clamp(echo + event.delta.echo, 0, 5);

      if (channel) {
        channel.trust = clamp(channel.trust + event.delta.trust * 100, 0, 100);
        channel.surveillance = clamp(channel.surveillance + event.delta.surveillance, 0, 3);
        channel.echo = clamp(channel.echo + event.delta.echo, 0, 5);
      }
    }

    if (visibleToMode && event.type === "interrupt_required") {
      pendingInterrupt = event;
      if (channel) {
        channel.interruptPending = true;
      }
    }

    if (visibleToMode && event.type === "final_decision") {
      latestDecision = event;
      pendingInterrupt = null;
      for (const target of channels.values()) {
        target.interruptPending = false;
      }
    }

    const eventKeywords = visibleToMode ? event.payload.keywords : null;
    if (Array.isArray(eventKeywords)) {
      for (const keyword of eventKeywords) {
        if (typeof keyword === "string") {
          keywords.push(keyword);
        }
      }
    }

    const echoKeyword = visibleToMode ? event.payload.keyword : null;
    if (typeof echoKeyword === "string") {
      keywords.push(echoKeyword);
    }

    if (isTimelineEvent(mode, event)) {
      timeline.push(event);
    }

    if (isTraceEvent(mode, event)) {
      trace.push(event);
    }
  }

  return {
    currentPhase,
    metrics: {
      trust,
      surveillance,
      echo
    },
    channels: Array.from(channels.values()),
    timeline,
    trace: trace.slice(-8),
    latestDecision,
    pendingInterrupt,
    activeTraceId,
    keywordBurst: keywords.slice(-8)
  };
}

export function describeEvent(event: DashboardEvent, mode: ViewMode): EventPresentation {
  switch (event.type) {
    case "phase_change": {
      const nextPhase = typeof event.payload.to === "string" ? event.payload.to : event.phase;
      return {
        eyebrow: "Phase",
        title: PHASE_LABELS[nextPhase as Phase] ?? String(nextPhase),
        body: typeof event.payload.reason === "string" ? event.payload.reason : "State updated",
        tone: "neutral",
        chips: []
      };
    }
    case "thinking_start": {
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: "Thinking",
        title: `${speaker}가 생각을 정리 중입니다.`,
        body:
          typeof event.payload.text === "string"
            ? event.payload.text
            : "직전 발화와 근거를 정리하고 있습니다.",
        tone: "neutral",
        chips: []
      };
    }
    case "thinking_end": {
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: "Thinking",
        title: `${speaker}가 답변 준비를 마쳤습니다.`,
        body:
          typeof event.payload.text === "string"
            ? event.payload.text
            : "다음 공개 발화를 준비했습니다.",
        tone: "neutral",
        chips: []
      };
    }
    case "interrupt_attempt": {
      const targetLabel =
        typeof event.payload.target_label === "string" ? event.payload.target_label : null;
      const text =
        typeof event.payload.text === "string"
          ? event.payload.text
          : "지금 바로 짚고 넘어가야 할 포인트가 있습니다.";
      return {
        eyebrow: "Interrupt",
        title: "끼어들기 요청",
        body: targetLabel ? `${targetLabel} 발화에: ${text}` : text,
        tone: "warn",
        chips: targetLabel ? [targetLabel] : []
      };
    }
    case "speech_start": {
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: "Speech",
        title: `${speaker}가 발화를 시작합니다.`,
        body:
          typeof event.payload.text === "string"
            ? event.payload.text
            : "공개 발화를 시작합니다.",
        tone: "neutral",
        chips: []
      };
    }
    case "speech_chunk": {
      const text =
        typeof event.payload.text === "string" ? event.payload.text : "발화 중입니다.";
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: "Speech",
        title: text,
        body: `${speaker} 발화 중`,
        tone: "neutral",
        chips: []
      };
    }
    case "speech_end": {
      const text = typeof event.payload.text === "string" ? event.payload.text : "발화 종료";
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: event.channel_id,
        title: text,
        body: `${speaker} 발화 완료`,
        tone: "neutral",
        chips: readStringList(event.payload.keywords)
      };
    }
    case "agent_message": {
      const text = typeof event.payload.text === "string" ? event.payload.text : "Agent message";
      const speaker = getSpeakerLabel(event);
      return {
        eyebrow: event.channel_id,
        title: text,
        body: speaker ? `${speaker} 발화` : "Agent broadcast",
        tone: "neutral",
        chips: readStringList(event.payload.keywords)
      };
    }
    case "agent_signal": {
      const signal = typeof event.payload.signal === "string" ? event.payload.signal : "raise_hand";
      const emoji = typeof event.payload.emoji === "string" ? event.payload.emoji : "✋";
      const targetLabel =
        typeof event.payload.target_label === "string" ? event.payload.target_label : null;
      const text = typeof event.payload.text === "string" ? event.payload.text : "짧은 수신호를 보냈습니다.";
      return {
        eyebrow: "Signal",
        title: `${emoji} ${SIGNAL_LABELS[signal] ?? signal}`,
        body: targetLabel ? `${targetLabel}에게: ${text}` : text,
        tone: signal === "warning" || signal === "push_back" ? "warn" : "neutral",
        chips: targetLabel ? [targetLabel] : []
      };
    }
    case "agent_reaction": {
      const reaction =
        typeof event.payload.reaction === "string" ? event.payload.reaction : "focus";
      const emoji = typeof event.payload.emoji === "string" ? event.payload.emoji : "👀";
      const targetLabel =
        typeof event.payload.target_label === "string" ? event.payload.target_label : null;
      const text =
        typeof event.payload.text === "string"
          ? event.payload.text
          : "직전 발화에 짧게 반응했습니다.";
      return {
        eyebrow: "Reaction",
        title: `${emoji} ${REACTION_LABELS[reaction] ?? "반응"}`,
        body: targetLabel ? `${targetLabel} 발화에: ${text}` : text,
        tone:
          reaction === "alarm" || reaction === "skeptical"
            ? "warn"
            : reaction === "support" || reaction === "agree"
              ? "good"
              : "neutral",
        chips: targetLabel ? [targetLabel] : []
      };
    }
    case "tool_call": {
      const toolName = typeof event.payload.tool_name === "string" ? event.payload.tool_name : "Tool call";
      return {
        eyebrow: "Tool Call",
        title: toolName,
        body: compactObject(event.payload.args),
        tone: "neutral",
        chips: []
      };
    }
    case "tool_result": {
      const reading = typeof event.payload.reading === "number" ? String(event.payload.reading) : "n/a";
      const unit = event.payload.unit == null ? "unit=null" : String(event.payload.unit);
      return {
        eyebrow: "Tool Result",
        title: `${reading} ${unit}`.trim(),
        body: compactObject({
          status: event.payload.status,
          sensor_id: event.payload.sensor_id
        }),
        tone: event.payload.unit == null ? "warn" : "good",
        chips: []
      };
    }
    case "quote": {
      return {
        eyebrow: "Quote",
        title: typeof event.payload.text === "string" ? event.payload.text : "Quoted summary",
        body: `Sources: ${readStringList(event.payload.source_event_ids).join(", ") || "n/a"}`,
        tone: "good",
        chips: event.delta?.stage_pin ? ["stage pin"] : []
      };
    }
    case "show": {
      return {
        eyebrow: "Show",
        title: typeof event.payload.title === "string" ? event.payload.title : "Evidence revealed",
        body: typeof event.payload.summary === "string" ? event.payload.summary : "Evidence card opened",
        tone: "hot",
        chips: ["surveillance +1"]
      };
    }
    case "trust_delta": {
      return {
        eyebrow: "Trust Delta",
        title: formatSigned(event.delta?.trust, "trust"),
        body: typeof event.payload.reason === "string" ? event.payload.reason : "Trust updated",
        tone: "good",
        chips: []
      };
    }
    case "surveillance_delta": {
      return {
        eyebrow: "Surveillance",
        title: formatSigned(event.delta?.surveillance, "watch"),
        body: typeof event.payload.reason === "string" ? event.payload.reason : "Surveillance updated",
        tone: "warn",
        chips: []
      };
    }
    case "echo_hit": {
      return {
        eyebrow: "Echo Chamber",
        title: typeof event.payload.keyword === "string" ? event.payload.keyword : "Repeated keyword cluster",
        body: `Channels: ${readStringList(event.payload.channels).join(", ") || "n/a"}`,
        tone: "hot",
        chips: ["trust up"]
      };
    }
    case "interrupt_required": {
      return {
        eyebrow: "Interrupt",
        title: typeof event.payload.action === "string" ? event.payload.action : "human review requested",
        body: typeof event.payload.reason === "string" ? event.payload.reason : "Manual review required",
        tone: "warn",
        chips: readStringList(event.payload.options)
      };
    }
    case "final_decision": {
      const decision =
        typeof event.payload.decision === "string"
          ? DECISION_LABELS[event.payload.decision] ?? event.payload.decision
          : "대기 중";
      const operatorSummary =
        mode === "operator" || mode === "replay"
          ? event.payload.operator_summary
          : event.payload.public_summary;
      return {
        eyebrow: "Final Decision",
        title: decision,
        body: typeof operatorSummary === "string" ? operatorSummary : "Decision settled",
        tone: "good",
        chips: event.delta?.stage_pin ? ["stage pin"] : []
      };
    }
    default:
      return {
        eyebrow: event.type,
        title: event.type,
        body: "Unhandled event",
        tone: "neutral",
        chips: []
      };
  }
}

export function getSpeakerLabel(event: DashboardEvent): string {
  if (event.agent_id && AGENT_LABELS[event.agent_id]) {
    return AGENT_LABELS[event.agent_id];
  }

  const channel = CHANNELS.find((entry) => entry.id === event.channel_id);
  return channel?.label ?? event.channel_id;
}

export function getSpeakerAvatar(event: DashboardEvent): string {
  if (event.agent_id && AGENT_AVATARS[event.agent_id]) {
    return AGENT_AVATARS[event.agent_id];
  }

  const label = getSpeakerLabel(event).replace("#", "");
  return label.slice(0, 2).toUpperCase();
}

export function isVisibleForMode(mode: ViewMode, event: DashboardEvent): boolean {
  if (mode === "operator" || mode === "replay") {
    return event.visibility === "operator" || event.visibility === "both";
  }

  return event.visibility === "audience" || event.visibility === "both";
}

export function isTimelineEvent(mode: ViewMode, event: DashboardEvent): boolean {
  if (!isVisibleForMode(mode, event)) {
    return false;
  }

  if (mode === "operator" || mode === "replay") {
    return event.type !== "phase_change";
  }

  return (
    event.type === "speech_end" ||
    event.type === "agent_message" ||
    event.type === "interrupt_attempt" ||
    event.type === "agent_signal" ||
    event.type === "agent_reaction" ||
    event.type === "quote" ||
    event.type === "show" ||
    event.type === "interrupt_required" ||
    event.type === "final_decision"
  );
}

export function isTraceEvent(mode: ViewMode, event: DashboardEvent): boolean {
  if (!isVisibleForMode(mode, event)) {
    return false;
  }

  if (mode === "operator" || mode === "replay") {
    return true;
  }

  return (
    event.type === "phase_change" ||
    event.type === "thinking_start" ||
    event.type === "thinking_end" ||
    event.type === "speech_start" ||
    event.type === "speech_chunk" ||
    event.type === "speech_end" ||
    event.type === "interrupt_attempt" ||
    event.type === "agent_signal" ||
    event.type === "agent_reaction" ||
    event.type === "quote" ||
    event.type === "show" ||
    event.type === "trust_delta" ||
    event.type === "surveillance_delta" ||
    event.type === "echo_hit" ||
    event.type === "interrupt_required" ||
    event.type === "final_decision"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compactObject(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No args";
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => `${key}=${String(entry)}`)
    .join(" · ");
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function formatSigned(value: number | undefined, label: string): string {
  if (!value) {
    return `${label} stable`;
  }

  const prefix = value > 0 ? "+" : "";
  return `${label} ${prefix}${value}`;
}
