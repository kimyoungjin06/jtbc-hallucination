import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SETTINGS_FILE = path.join(process.cwd(), "config", "agent-models.json");
const AGENT_IDS = ["coordinator", "existentialist", "utilitarian", "virtue", "skeptic", "pragmatist"];
const PROVIDERS = [
  {
    id: "openai",
    label: "GPT / OpenAI",
    envVar: "OPENAI_API_KEY"
  },
  {
    id: "anthropic",
    label: "Claude / Anthropic",
    envVar: "ANTHROPIC_API_KEY"
  },
  {
    id: "google",
    label: "Gemini / Google",
    envVar: "GOOGLE_API_KEY"
  }
];

const DEFAULT_SETTINGS = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  agents: {
    coordinator: {
      provider: "openai",
      model: "",
      temperature: 0.3,
      enabled: true
    },
    existentialist: {
      provider: "openai",
      model: "",
      temperature: 0.7,
      enabled: true
    },
    utilitarian: {
      provider: "google",
      model: "",
      temperature: 0.6,
      enabled: true
    },
    virtue: {
      provider: "google",
      model: "",
      temperature: 0.6,
      enabled: true
    },
    skeptic: {
      provider: "anthropic",
      model: "",
      temperature: 0.5,
      enabled: true
    },
    pragmatist: {
      provider: "anthropic",
      model: "",
      temperature: 0.5,
      enabled: true
    }
  }
};

function normalizeProvider(value, fallback) {
  return PROVIDERS.some((provider) => provider.id === value) ? value : fallback;
}

function normalizeModel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTemperature(value, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(2, Number(value.toFixed(2))))
    : fallback;
}

function normalizeEnabled(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSettings(input) {
  const source = typeof input === "object" && input !== null ? input : {};
  const agentSource =
    typeof source.agents === "object" && source.agents !== null ? source.agents : {};

  const agents = AGENT_IDS.reduce((accumulator, agentId) => {
    const fallback = DEFAULT_SETTINGS.agents[agentId];
    const incoming =
      typeof agentSource[agentId] === "object" && agentSource[agentId] !== null
        ? agentSource[agentId]
        : {};

    accumulator[agentId] = {
      provider: normalizeProvider(incoming.provider, fallback.provider),
      model: normalizeModel(incoming.model),
      temperature: normalizeTemperature(incoming.temperature, fallback.temperature),
      enabled: normalizeEnabled(incoming.enabled, fallback.enabled)
    };
    return accumulator;
  }, {});

  return {
    version: 1,
    updatedAt:
      typeof source.updatedAt === "string" && source.updatedAt.length > 0
        ? source.updatedAt
        : DEFAULT_SETTINGS.updatedAt,
    agents
  };
}

export function getRuntimeModelSettingsPath() {
  return SETTINGS_FILE;
}

export function readRuntimeModelRoutingSettings() {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      return DEFAULT_SETTINGS;
    }

    const raw = readFileSync(SETTINGS_FILE, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getRuntimeProviderKeyStatuses() {
  return PROVIDERS.map((provider) => ({
    ...provider,
    configured:
      typeof process.env[provider.envVar] === "string" &&
      process.env[provider.envVar].trim().length > 0
  }));
}

export function getRuntimeRoutingDigest(settings = readRuntimeModelRoutingSettings()) {
  return AGENT_IDS.reduce((accumulator, agentId) => {
    const config = settings.agents[agentId];
    accumulator[agentId] = {
      provider: config.provider,
      model: config.model,
      enabled: config.enabled
    };
    return accumulator;
  }, {});
}

export function getRuntimeModelRoutingSummary() {
  const settings = readRuntimeModelRoutingSettings();

  return {
    filePath: SETTINGS_FILE,
    settings,
    providers: getRuntimeProviderKeyStatuses(),
    routingDigest: getRuntimeRoutingDigest(settings)
  };
}
