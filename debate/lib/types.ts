export type ViewMode = "operator" | "audience" | "tv" | "replay";
export type FeedSource = "replay" | "socket";

export type Visibility = "operator" | "audience" | "both";

export type Phase =
  | "idle"
  | "official_statement"
  | "chaos_time"
  | "interrupt"
  | "final_decision";

export type EventType =
  | "phase_change"
  | "thinking_start"
  | "thinking_end"
  | "interrupt_attempt"
  | "speech_start"
  | "speech_chunk"
  | "speech_end"
  | "agent_message"
  | "agent_signal"
  | "agent_reaction"
  | "tool_call"
  | "tool_result"
  | "quote"
  | "show"
  | "trust_delta"
  | "surveillance_delta"
  | "echo_hit"
  | "interrupt_required"
  | "final_decision";

export interface EventDelta {
  trust: number;
  surveillance: number;
  echo: number;
  stage_pin: boolean;
}

export interface DashboardEvent {
  event_id: string;
  seq: number;
  ts: string;
  emitted_at?: string | null;
  round_id: string;
  phase: Phase;
  channel_id: string;
  agent_id: string | null;
  trace_id: string | null;
  visibility: Visibility;
  type: EventType;
  payload: Record<string, unknown>;
  delta: EventDelta | null;
  meta: Record<string, unknown>;
}

export interface ChannelConfig {
  id: string;
  label: string;
  group: "core" | "specialist" | "public";
  hue: string;
}

export interface EventPresentation {
  eyebrow: string;
  title: string;
  body: string;
  tone: "neutral" | "hot" | "warn" | "good";
  chips: string[];
}

export interface ChannelSnapshot {
  id: string;
  label: string;
  group: ChannelConfig["group"];
  hue: string;
  trust: number;
  surveillance: number;
  echo: number;
  unread: number;
  lastEventType: EventType | null;
  lastSummary: string;
  lastSeq: number;
  interruptPending: boolean;
}

export interface DashboardSnapshot {
  currentPhase: Phase;
  metrics: {
    trust: number;
    surveillance: number;
    echo: number;
  };
  channels: ChannelSnapshot[];
  timeline: DashboardEvent[];
  trace: DashboardEvent[];
  latestDecision: DashboardEvent | null;
  pendingInterrupt: DashboardEvent | null;
  activeTraceId: string | null;
  keywordBurst: string[];
}

export type RuntimeState =
  | "connecting"
  | "idle"
  | "ready"
  | "countdown"
  | "running"
  | "waiting_for_interrupt"
  | "complete"
  | "fallback"
  | "offline";

export type RuntimeEngine = "scripted" | "langgraph";
export type RuntimeStore = "memory" | "redis-streams";

export interface RuntimeRouteConfig {
  provider: string;
  model: string;
  enabled: boolean;
}

export interface RuntimeStatus {
  roundId: string;
  runId?: string | null;
  startedAt?: string | null;
  countdownEndsAt?: string | null;
  state: RuntimeState;
  cursor: number;
  total: number;
  selectedAction: string | null;
  source: FeedSource;
  canModerate?: boolean;
  engine?: RuntimeEngine;
  store?: RuntimeStore;
  routingDigest?: Record<string, RuntimeRouteConfig>;
  modelSettingsUpdatedAt?: string;
}

export interface ArchivedRunSummary {
  runId: string;
  roundId: string;
  startedAt: string;
  completedAt: string;
  selectedAction: string | null;
  eventCount: number;
  engine: RuntimeEngine;
  store: RuntimeStore;
  publicSummary: string | null;
}

export interface ArchivedRun extends ArchivedRunSummary {
  operatorSummary: string | null;
  events: DashboardEvent[];
}
