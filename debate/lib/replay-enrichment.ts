import type { DashboardEvent } from "@/lib/types";

const ENRICHABLE_TYPES = new Set(["agent_message", "quote", "show"]);

const AGENT_LABELS: Record<string, string> = {
  coordinator: "사회자",
  agent_existentialist: "실존주의자",
  agent_utilitarian: "공리주의자",
  agent_virtue: "덕 윤리학자",
  agent_skeptic: "회의론자",
  agent_pragmatist: "실용주의자"
};

type ReplayMood = "positive" | "caution" | "evidence" | "neutral";

const POSITIVE_RE = /(일관|합의|정상|유효|안정|승인|수렴|동시에 관측|확인됩니다|같은 결론)/i;
const CAUTION_RE = /(보정|대기|누락|불안정|반려|보류|오탐|없습니다|없고|실패|위험|이상|stall|warning|fallback)/i;
const EVIDENCE_RE = /(로그|근거|증거|메타데이터|telemetry|probe|인증서|패킷|이력|센서)/i;

function readEventText(event: DashboardEvent): string {
  const payload = event.payload ?? {};
  const candidate = [
    payload.text,
    payload.summary,
    payload.reason,
    payload.operator_summary,
    payload.public_summary
  ].find((value) => typeof value === "string" && value.length > 0);

  return typeof candidate === "string" ? candidate : "";
}

function getSpeakerLabel(event: DashboardEvent): string {
  if (event.agent_id && AGENT_LABELS[event.agent_id]) {
    return AGENT_LABELS[event.agent_id];
  }

  return event.channel_id;
}

function inferReplayMood(event: DashboardEvent): ReplayMood {
  const text = readEventText(event);

  if (POSITIVE_RE.test(text) && !CAUTION_RE.test(text)) {
    return "positive";
  }

  if (CAUTION_RE.test(text)) {
    return "caution";
  }

  if (EVIDENCE_RE.test(text) || event.type === "show") {
    return "evidence";
  }

  return "neutral";
}

function buildSignalPayload(mood: ReplayMood, target: DashboardEvent | null) {
  if (mood === "positive") {
    return {
      signal: "confident",
      emoji: "✅",
      target_agent: null,
      target_label: null,
      text: "지금 근거가 같은 방향으로 모이고 있습니다."
    };
  }

  if (mood === "evidence") {
    return {
      signal: "need_evidence",
      emoji: "📎",
      target_agent: target?.agent_id ?? null,
      target_label: target ? getSpeakerLabel(target) : null,
      text: "근거 카드와 메타데이터를 한 번 더 붙여 보겠습니다."
    };
  }

  if (mood === "caution") {
    return {
      signal: "warning",
      emoji: "⚠️",
      target_agent: null,
      target_label: null,
      text: "이 결론은 바로 밀지 말고 한 번 더 조심해서 보겠습니다."
    };
  }

  return {
    signal: "raise_hand",
    emoji: "✋",
    target_agent: null,
    target_label: null,
    text: "이 지점에 짧게 의견을 보태겠습니다."
  };
}

function buildReactionPayload(mood: ReplayMood, target: DashboardEvent | null) {
  if (mood === "positive") {
    return {
      reaction: "support",
      emoji: "🙌",
      target_agent: target?.agent_id ?? null,
      target_label: target ? getSpeakerLabel(target) : null,
      text: "방금 방향에 힘이 실립니다."
    };
  }

  if (mood === "evidence") {
    return {
      reaction: "note",
      emoji: "📝",
      target_agent: target?.agent_id ?? null,
      target_label: target ? getSpeakerLabel(target) : null,
      text: "지금 근거를 메모로 고정하겠습니다."
    };
  }

  if (mood === "caution") {
    return {
      reaction: "skeptical",
      emoji: "🤨",
      target_agent: target?.agent_id ?? null,
      target_label: target ? getSpeakerLabel(target) : null,
      text: "이 해석은 한 번 더 검산하겠습니다."
    };
  }

  return {
    reaction: "focus",
    emoji: "👀",
    target_agent: target?.agent_id ?? null,
    target_label: target ? getSpeakerLabel(target) : null,
    text: "방금 발화를 계속 따라가고 있습니다."
  };
}

function createSyntheticTimestamp(event: DashboardEvent, nextEvent: DashboardEvent | null) {
  const currentTs = Date.parse(event.ts);
  const nextTs = nextEvent ? Date.parse(nextEvent.ts) : Number.NaN;

  if (Number.isFinite(currentTs) && Number.isFinite(nextTs) && nextTs > currentTs) {
    return new Date(currentTs + Math.max(180, Math.floor((nextTs - currentTs) / 3))).toISOString();
  }

  if (Number.isFinite(currentTs)) {
    return new Date(currentTs + 420).toISOString();
  }

  return event.ts;
}

function shouldEnrichEvent(event: DashboardEvent) {
  return ENRICHABLE_TYPES.has(event.type) && typeof event.agent_id === "string" && event.agent_id.length > 0;
}

export function isSyntheticReplayEvent(event: DashboardEvent) {
  return event.meta?.synthetic_replay === true;
}

function hasAdjacentEmojiEvent(
  events: DashboardEvent[],
  index: number,
  sourceEvent: DashboardEvent
) {
  return [events[index + 1], events[index + 2]].some(
    (candidate) =>
      Boolean(candidate) &&
      candidate?.agent_id === sourceEvent.agent_id &&
      (candidate.type === "agent_signal" || candidate.type === "agent_reaction")
  );
}

export function enrichReplayEvents(events: DashboardEvent[]): DashboardEvent[] {
  const enriched: DashboardEvent[] = [];
  let previousSpeakerEvent: DashboardEvent | null = null;
  let syntheticCount = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const nextEvent = events[index + 1] ?? null;
    enriched.push(event);

    if (!shouldEnrichEvent(event)) {
      continue;
    }

    if (hasAdjacentEmojiEvent(events, index, event)) {
      previousSpeakerEvent = event;
      syntheticCount += 1;
      continue;
    }

    const mood = inferReplayMood(event);
    const useReaction = Boolean(previousSpeakerEvent) && syntheticCount % 2 === 1;
    const payload = useReaction
      ? buildReactionPayload(mood, previousSpeakerEvent)
      : buildSignalPayload(mood, previousSpeakerEvent);

    enriched.push({
      ...event,
      event_id: `${event.event_id}__${useReaction ? "reaction" : "signal"}`,
      seq: Number((event.seq + 0.1).toFixed(1)),
      ts: createSyntheticTimestamp(event, nextEvent),
      type: useReaction ? "agent_reaction" : "agent_signal",
      payload,
      delta: null,
      meta: {
        ...event.meta,
        synthetic_replay: true,
        derived_from: event.event_id
      }
    });

    previousSpeakerEvent = event;
    syntheticCount += 1;
  }

  return enriched;
}
