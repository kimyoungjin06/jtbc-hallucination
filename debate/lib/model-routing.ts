export type ProviderId = "openai" | "anthropic" | "google";

export type AgentKey =
  | "coordinator"
  | "existentialist"
  | "utilitarian"
  | "virtue"
  | "skeptic"
  | "pragmatist";

export interface AgentOption {
  id: AgentKey;
  label: string;
  description: string;
}

export interface ProviderOption {
  id: ProviderId;
  label: string;
  vendor: string;
  envVar: string;
}

export interface AgentModelConfig {
  provider: ProviderId;
  model: string;
  temperature: number;
  enabled: boolean;
}

export interface ModelRoutingSettings {
  version: 1;
  updatedAt: string;
  agents: Record<AgentKey, AgentModelConfig>;
}

export interface ProviderKeyStatus extends ProviderOption {
  configured: boolean;
}

export const AGENT_OPTIONS: AgentOption[] = [
  {
    id: "coordinator",
    label: "사회자",
    description: "토론 흐름을 정리하고 논점을 요약하며 발언 기회를 조율하는 진행자"
  },
  {
    id: "existentialist",
    label: "실존주의자",
    description: "개인의 자유·선택·책임을 강조하며 주체적 실존을 옹호하는 토론자"
  },
  {
    id: "utilitarian",
    label: "공리주의자",
    description: "최대 다수의 최대 행복이라는 결과 중심 논리로 판단하는 토론자"
  },
  {
    id: "virtue",
    label: "덕 윤리학자",
    description: "성품과 덕목, 인격 수양을 중심으로 윤리를 논하는 토론자"
  },
  {
    id: "skeptic",
    label: "회의론자",
    description: "모든 주장에 의문을 제기하고 논리적 허점을 파고드는 토론자"
  },
  {
    id: "pragmatist",
    label: "실용주의자",
    description: "이론보다 현실적 결과와 실천 가능성을 우선시하는 토론자"
  }
];

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "openai",
    label: "GPT / OpenAI",
    vendor: "OpenAI",
    envVar: "OPENAI_API_KEY"
  },
  {
    id: "anthropic",
    label: "Claude / Anthropic",
    vendor: "Anthropic",
    envVar: "ANTHROPIC_API_KEY"
  },
  {
    id: "google",
    label: "Gemini / Google",
    vendor: "Google",
    envVar: "GOOGLE_API_KEY"
  }
];

export const DEFAULT_MODEL_ROUTING: ModelRoutingSettings = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  agents: {
    coordinator: {
      provider: "openai",
      model: "gpt-5-nano",
      temperature: 0.3,
      enabled: true
    },
    existentialist: {
      provider: "openai",
      model: "gpt-5-nano",
      temperature: 0.7,
      enabled: true
    },
    utilitarian: {
      provider: "google",
      model: "gemini-2.5-flash-lite",
      temperature: 0.6,
      enabled: true
    },
    virtue: {
      provider: "google",
      model: "gemini-2.5-flash-lite",
      temperature: 0.6,
      enabled: true
    },
    skeptic: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      temperature: 0.5,
      enabled: true
    },
    pragmatist: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      temperature: 0.5,
      enabled: true
    }
  }
};

function clampTemperature(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(2, Number(value.toFixed(2))));
}

function normalizeProvider(value: unknown, fallback: ProviderId): ProviderId {
  return PROVIDER_OPTIONS.some((provider) => provider.id === value)
    ? (value as ProviderId)
    : fallback;
}

function normalizeModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnabled(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function mergeModelRouting(input: unknown): ModelRoutingSettings {
  const source =
    typeof input === "object" && input !== null ? (input as Partial<ModelRoutingSettings>) : {};
  const agentSource: Partial<Record<AgentKey, Partial<AgentModelConfig>>> =
    typeof source.agents === "object" && source.agents !== null
      ? (source.agents as Partial<Record<AgentKey, Partial<AgentModelConfig>>>)
      : {};

  const agents = AGENT_OPTIONS.reduce((accumulator, agent) => {
    const fallback = DEFAULT_MODEL_ROUTING.agents[agent.id];
    const incoming: Partial<AgentModelConfig> =
      typeof agentSource[agent.id] === "object" && agentSource[agent.id] !== null
        ? (agentSource[agent.id] as Partial<AgentModelConfig>)
        : {};

    accumulator[agent.id] = {
      provider: normalizeProvider(incoming.provider, fallback.provider),
      model: normalizeModel(incoming.model),
      temperature: clampTemperature(incoming.temperature, fallback.temperature),
      enabled: normalizeEnabled(incoming.enabled, fallback.enabled)
    };
    return accumulator;
  }, {} as Record<AgentKey, AgentModelConfig>);

  return {
    version: 1,
    updatedAt:
      typeof source.updatedAt === "string" && source.updatedAt.length > 0
        ? source.updatedAt
        : DEFAULT_MODEL_ROUTING.updatedAt,
    agents
  };
}

export function applyTimestamp(settings: ModelRoutingSettings): ModelRoutingSettings {
  return {
    ...settings,
    updatedAt: new Date().toISOString()
  };
}

export function getAgentRoutingDigest(settings: ModelRoutingSettings) {
  return AGENT_OPTIONS.reduce((accumulator, agent) => {
    const config = settings.agents[agent.id];
    accumulator[agent.id] = {
      provider: config.provider,
      model: config.model,
      enabled: config.enabled
    };
    return accumulator;
  }, {} as Record<AgentKey, { provider: ProviderId; model: string; enabled: boolean }>);
}
