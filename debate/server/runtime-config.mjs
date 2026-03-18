import "./load-env.mjs";

export const PORT = Number(process.env.SOCKET_PORT ?? 4010);
export const TICK_MS = Number(process.env.ROUND_TICK_MS ?? 1800);
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 45000);
export const ROUND_SIGNAL_MS = Number(process.env.ROUND_SIGNAL_MS ?? 2400);
export const ROUND_READY_COUNTDOWN_MS = Number(process.env.ROUND_READY_COUNTDOWN_MS ?? 3200);
export const ROUND_SPEECH_MIN_MS = Number(process.env.ROUND_SPEECH_MIN_MS ?? 3500);
export const ROUND_SPEECH_MAX_MS = Number(process.env.ROUND_SPEECH_MAX_MS ?? 12000);
export const ROUND_SPEECH_CHARS_PER_SEC = Number(
  process.env.ROUND_SPEECH_CHARS_PER_SEC ?? 2.5
);
/** Extra pause between different speakers (ms) to mimic natural turn-taking */
export const SPEAKER_TURN_PAUSE_MS = Number(process.env.SPEAKER_TURN_PAUSE_MS ?? 2200);
/** Random jitter range (ms) added to delays for human-like variability */
export const HUMAN_JITTER_MAX_MS = Number(process.env.HUMAN_JITTER_MAX_MS ?? 800);
export const DEFAULT_ROUND_ID = process.env.ROUND_ID ?? "philosophy-r1";
export const ROOM_PREFIX = "round:";
export const RUNTIME_ENGINE =
  process.env.RUNTIME_ENGINE === "scripted" ? "scripted" : "langgraph";
export const REDIS_URL = process.env.REDIS_URL ?? "";
export const REDIS_STREAM_PREFIX =
  process.env.REDIS_STREAM_PREFIX ?? "team-agent-vis";
export const OPERATOR_KEY = process.env.OPERATOR_KEY ?? "";
