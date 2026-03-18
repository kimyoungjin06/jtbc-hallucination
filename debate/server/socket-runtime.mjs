import { createServer } from "node:http";
import { createRequire } from "node:module";

import { Server } from "socket.io";

import { getRoundBlueprint, clone } from "./case-data.mjs";
import { getRuntimeModelRoutingSummary } from "./model-routing.mjs";
import { getProviderRuntimeSupport } from "./provider-clients.mjs";
import {
  DEFAULT_ROUND_ID,
  HUMAN_JITTER_MAX_MS,
  LLM_TIMEOUT_MS,
  OPERATOR_KEY,
  PORT,
  REDIS_STREAM_PREFIX,
  REDIS_URL,
  ROOM_PREFIX,
  ROUND_READY_COUNTDOWN_MS,
  ROUND_SIGNAL_MS,
  ROUND_SPEECH_CHARS_PER_SEC,
  ROUND_SPEECH_MAX_MS,
  ROUND_SPEECH_MIN_MS,
  RUNTIME_ENGINE,
  SPEAKER_TURN_PAUSE_MS,
  TICK_MS
} from "./runtime-config.mjs";
import { createRuntimeEngine } from "./runtime-engine.mjs";

const require = createRequire(import.meta.url);
const { createEventStore } = require("./event-store.cjs");
const { archiveRun } = require("./run-archive.cjs");

const store = await createEventStore({
  redisUrl: REDIS_URL,
  streamPrefix: REDIS_STREAM_PREFIX
});

const rounds = new Map();
const roundLoads = new Map();
const blueprints = new Map();
const engines = new Map();

function formatRunTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}${millis}`;
}

function createRunId(roundId) {
  return `${roundId}-${formatRunTimestamp()}`;
}

function getBlueprint(roundId) {
  if (!blueprints.has(roundId)) {
    blueprints.set(roundId, getRoundBlueprint(roundId));
  }

  return blueprints.get(roundId);
}

async function getEngine(roundId) {
  if (engines.has(roundId)) {
    return engines.get(roundId);
  }

  const engine = await createRuntimeEngine({
    preferredKind: RUNTIME_ENGINE,
    blueprint: getBlueprint(roundId),
    getRuntimeConfig: () => {
      const modelRouting = getRuntimeModelRoutingSummary();
      return {
        routingDigest: modelRouting.routingDigest,
        settingsUpdatedAt: modelRouting.settings.updatedAt
      };
    }
  });

  engines.set(roundId, engine);
  return engine;
}

function roomName(roundId) {
  return `${ROOM_PREFIX}${roundId}`;
}

function sanitizeAction(action) {
  return typeof action === "string" &&
    ["approve", "reject", "hold", "mitigate"].includes(action)
    ? action
    : "hold";
}

function findSelectedAction(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const decision = event?.payload?.decision;
    if (event?.type === "final_decision" && typeof decision === "string") {
      return decision;
    }
  }

  return null;
}

function buildPreInterruptQueue(roundId, emittedEvents, blueprint) {
  const preInterruptEventCount = blueprint.preInterruptEvents.length;
  const emittedSeqs = new Set(
    emittedEvents
      .filter((event) => typeof event?.seq === "number" && event.seq <= preInterruptEventCount)
      .map((event) => event.seq)
  );

  return blueprint.preInterruptEvents
    .filter((event) => !emittedSeqs.has(event.seq))
    .map((event) => {
      const queuedEvent = clone(event);
      queuedEvent.round_id = roundId;
      return queuedEvent;
    });
}

async function buildDecisionQueue(roundId, emittedEvents, selectedAction, blueprint, engine) {
  if (!selectedAction) {
    return [];
  }

  const preInterruptEventCount = blueprint.preInterruptEvents.length;
  const emittedSeqs = new Set(
    emittedEvents
      .filter((event) => typeof event?.seq === "number")
      .map((event) => event.seq)
  );
  const preInterruptEvents = emittedEvents.filter(
    (event) => typeof event?.seq === "number" && event.seq <= preInterruptEventCount
  );
  const decisionEvents = await engine.buildDecisionEvents({
    roundId,
    action: selectedAction,
    emittedEvents: preInterruptEvents
  });

  return decisionEvents
    .filter((event) => !emittedSeqs.has(event.seq))
    .map((event) => {
      const queuedEvent = clone(event);
      queuedEvent.round_id = roundId;
      return queuedEvent;
    });
}

function deriveRoundState(events, selectedAction, pendingQueue) {
  if (selectedAction) {
    return pendingQueue.length > 0 ? "idle" : "complete";
  }

  if (events.some((event) => event.type === "interrupt_required")) {
    return "waiting_for_interrupt";
  }

  return "idle";
}

function findLatestDecisionEvent(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === "final_decision") {
      return events[index];
    }
  }

  return null;
}

async function archiveCompletedRun(round) {
  if (!round.activeRunId || round.emitted.length === 0) {
    return;
  }

  const decisionEvent = findLatestDecisionEvent(round.emitted);
  await archiveRun({
    runId: round.activeRunId,
    roundId: round.roundId,
    startedAt: round.startedAt ?? round.emitted[0]?.ts ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    selectedAction: round.selectedAction ?? null,
    eventCount: round.emitted.length,
    engine: round.engine.kind,
    store: store.kind,
    publicSummary:
      typeof decisionEvent?.payload?.public_summary === "string"
        ? decisionEvent.payload.public_summary
        : null,
    operatorSummary:
      typeof decisionEvent?.payload?.operator_summary === "string"
        ? decisionEvent.payload.operator_summary
        : null,
    events: round.emitted
  });
}

async function hydrateRound(roundId) {
  const blueprint = getBlueprint(roundId);
  const engine = await getEngine(roundId);
  const emitted = await store.listEvents(roundId);
  const selectedAction = (await store.getSelectedAction(roundId)) ?? findSelectedAction(emitted);
  const runContext = await store.getRunContext(roundId);
  const queue = buildPreInterruptQueue(roundId, emitted, blueprint).concat(
    await buildDecisionQueue(roundId, emitted, selectedAction, blueprint, engine)
  );

  const round = {
    roundId,
    emitted,
    queue,
    state: deriveRoundState(emitted, selectedAction, queue),
    timer: null,
    countdownEndsAt: null,
    selectedAction,
    activeRunId: runContext?.runId ?? null,
    startedAt: runContext?.startedAt ?? null,
    blueprint,
    engine
  };

  if (round.state === "complete") {
    await archiveCompletedRun(round);
  }

  return round;
}

async function getRound(roundId) {
  if (rounds.has(roundId)) {
    return rounds.get(roundId);
  }

  if (roundLoads.has(roundId)) {
    return roundLoads.get(roundId);
  }

  const load = hydrateRound(roundId).then((round) => {
    rounds.set(roundId, round);
    roundLoads.delete(roundId);
    return round;
  });

  roundLoads.set(roundId, load);
  return load;
}

function sanitizeViewMode(viewMode) {
  return viewMode === "operator" || viewMode === "tv" ? viewMode : "audience";
}

function hasOperatorAccess(operatorKey) {
  if (!OPERATOR_KEY) {
    return true;
  }

  return typeof operatorKey === "string" && operatorKey === OPERATOR_KEY;
}

function isVisibleForView(viewMode, event) {
  if (viewMode === "operator") {
    return event.visibility === "operator" || event.visibility === "both";
  }

  return event.visibility === "audience" || event.visibility === "both";
}

function sanitizeEventForView(viewMode, event) {
  if (!isVisibleForView(viewMode, event)) {
    return null;
  }

  if (viewMode === "operator") {
    return event;
  }

  const sanitizedEvent = clone(event);
  sanitizedEvent.trace_id = null;
  sanitizedEvent.meta = {};

  if (sanitizedEvent.type === "show") {
    delete sanitizedEvent.payload.raw_payload_ref;
  }

  if (sanitizedEvent.type === "interrupt_required") {
    delete sanitizedEvent.payload.options;
  }

  if (sanitizedEvent.type === "final_decision") {
    delete sanitizedEvent.payload.operator_summary;
  }

  return sanitizedEvent;
}

function findVisibleDecision(round, viewMode) {
  if (viewMode === "operator") {
    return round.selectedAction;
  }

  for (let index = round.emitted.length - 1; index >= 0; index -= 1) {
    const event = sanitizeEventForView(viewMode, round.emitted[index]);
    const decision = event?.payload?.decision;
    if (event?.type === "final_decision" && typeof decision === "string") {
      return decision;
    }
  }

  return null;
}

function getStatus(round, source = "socket", viewMode = "operator") {
  const modelRouting = getRuntimeModelRoutingSummary();

  return {
    roundId: round.roundId,
    runId: round.activeRunId ?? null,
    startedAt: round.startedAt ?? null,
    countdownEndsAt: round.countdownEndsAt ?? null,
    state: round.state,
    cursor: round.emitted.length,
    total: round.emitted.length + round.queue.length,
    selectedAction: findVisibleDecision(round, viewMode),
    source,
    canModerate: false,
    engine: viewMode === "operator" ? round.engine.kind : undefined,
    store: viewMode === "operator" ? store.kind : undefined,
    routingDigest: viewMode === "operator" ? modelRouting.routingDigest : undefined,
    modelSettingsUpdatedAt:
      viewMode === "operator" ? modelRouting.settings.updatedAt : undefined
  };
}

function getSocketViewMode(socket) {
  return sanitizeViewMode(socket.data.viewMode);
}

function canModerate(socket) {
  return socket.data.canModerate === true;
}

function canPrepare(socket) {
  return canModerate(socket) && getSocketViewMode(socket) === "operator";
}

function emitToRoundSubscribers(io, roundId, emit) {
  const subscriberIds = io.sockets.adapter.rooms.get(roomName(roundId));
  if (!subscriberIds) {
    return;
  }

  for (const socketId of subscriberIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      emit(socket, getSocketViewMode(socket));
    }
  }
}

function emitStatus(io, round) {
  emitToRoundSubscribers(io, round.roundId, (socket, viewMode) => {
    socket.emit("runtime:status", {
      ...getStatus(round, "socket", viewMode),
      canModerate: canModerate(socket)
    });
  });
}

function emitSnapshot(target, round) {
  const viewMode = getSocketViewMode(target);
  target.emit("round:snapshot", {
    roundId: round.roundId,
    events: round.emitted
      .map((event) => sanitizeEventForView(viewMode, event))
      .filter(Boolean)
  });
  target.emit("runtime:status", {
    ...getStatus(round, "socket", viewMode),
    canModerate: canModerate(target)
  });
}

function emitEvent(io, round, event) {
  emitToRoundSubscribers(io, round.roundId, (socket, viewMode) => {
    const visibleEvent = sanitizeEventForView(viewMode, event);
    if (visibleEvent) {
      socket.emit("round:event", visibleEvent);
    }
  });
}

function getNarrationText(event) {
  const payload = event?.payload ?? {};

  switch (event?.type) {
    case "thinking_start":
    case "thinking_end":
    case "interrupt_attempt":
    case "agent_reaction":
    case "speech_start":
    case "speech_chunk":
    case "speech_end":
    case "agent_message":
    case "quote":
      return typeof payload.text === "string" ? payload.text : "";
    case "show":
      return typeof payload.summary === "string"
        ? payload.summary
        : typeof payload.title === "string"
          ? payload.title
          : "";
    case "interrupt_required":
      return typeof payload.reason === "string" ? payload.reason : "";
    case "final_decision":
      return typeof payload.public_summary === "string"
        ? payload.public_summary
        : typeof payload.operator_summary === "string"
          ? payload.operator_summary
          : "";
    default:
      return "";
  }
}

/** Add human-like random jitter to any base delay */
function jitter(baseMs) {
  return baseMs + Math.round(Math.random() * HUMAN_JITTER_MAX_MS);
}

/** Track the last speaker so we can add turn-taking pauses */
let lastSpeakerAgentId = null;

function computeEventDelayMs(event) {
  if (!event) {
    return jitter(TICK_MS);
  }

  if (event.type === "agent_signal") {
    return jitter(ROUND_SIGNAL_MS);
  }

  // "Thinking" — longer pause to simulate genuine reflection
  if (event.type === "thinking_start") {
    return jitter(Math.max(1800, Math.round(ROUND_SIGNAL_MS * 1.5)));
  }

  if (event.type === "thinking_end") {
    return jitter(Math.max(800, Math.round(ROUND_SIGNAL_MS * 0.7)));
  }

  if (event.type === "agent_reaction") {
    return jitter(Math.max(1200, Math.round(ROUND_SIGNAL_MS * 1.1)));
  }

  if (event.type === "interrupt_attempt") {
    return jitter(Math.max(1400, Math.round(ROUND_SIGNAL_MS * 1.2)));
  }

  // Speaker turn-taking: add extra pause when a new person starts speaking
  if (event.type === "speech_start") {
    const isTurnChange =
      lastSpeakerAgentId !== null && event.agent_id !== lastSpeakerAgentId;
    lastSpeakerAgentId = event.agent_id;
    // New speaker gets a longer "gathering thoughts" pause
    return jitter(isTurnChange ? 1200 + SPEAKER_TURN_PAUSE_MS : 1200);
  }

  // Each chunk displayed at human reading/speaking speed (~2.5 chars/sec)
  if (event.type === "speech_chunk") {
    const text = getNarrationText(event);
    const charDuration = Math.round(
      (text.length / Math.max(1, ROUND_SPEECH_CHARS_PER_SEC)) * 1000
    );
    // Floor 600ms, ceiling 5000ms per chunk, with jitter
    return jitter(Math.max(600, Math.min(5000, 600 + charDuration)));
  }

  // Brief pause after finishing a sentence
  if (event.type === "speech_end") {
    return jitter(800);
  }

  const text = getNarrationText(event);
  if (text) {
    const speechDuration = Math.round(
      (text.length / Math.max(1, ROUND_SPEECH_CHARS_PER_SEC)) * 1000
    );
    return jitter(
      Math.max(
        ROUND_SPEECH_MIN_MS,
        Math.min(ROUND_SPEECH_MAX_MS, ROUND_SPEECH_MIN_MS + speechDuration)
      )
    );
  }

  return jitter(TICK_MS);
}

function schedule(io, round) {
  if (
    round.timer ||
    round.state === "idle" ||
    round.state === "ready" ||
    round.state === "countdown" ||
    round.state === "waiting_for_interrupt" ||
    round.state === "complete"
  ) {
    return;
  }

  const nextDelay = computeEventDelayMs(round.queue[0]);

  round.timer = setTimeout(() => {
    round.timer = null;
    void emitNext(io, round).catch((error) => {
      round.countdownEndsAt = null;
      round.state = "offline";
      emitToRoundSubscribers(io, round.roundId, (socket) => {
        socket.emit("runtime:error", {
          message: error.message
        });
      });
      emitStatus(io, round);
      console.error("[socket-runtime]", error);
    });
  }, nextDelay);
}

async function emitNext(io, round) {
  const event = round.queue.shift();

  if (!event) {
    round.countdownEndsAt = null;
    round.state = round.selectedAction ? "complete" : "waiting_for_interrupt";
    if (round.state === "complete") {
      await archiveCompletedRun(round);
    }
    emitStatus(io, round);
    return;
  }

  if (typeof event.emitted_at !== "string" || event.emitted_at.length === 0) {
    event.emitted_at = new Date().toISOString();
  }

  await store.appendEvent(round.roundId, event);
  round.emitted.push(event);

  round.state = event.type === "interrupt_required" ? "waiting_for_interrupt" : "running";
  round.countdownEndsAt = null;

  emitEvent(io, round, event);
  emitStatus(io, round);

  if (round.state === "running") {
    if (round.queue.length === 0 && round.selectedAction) {
      round.state = "complete";
      await archiveCompletedRun(round);
      emitStatus(io, round);
      return;
    }

    schedule(io, round);
  }
}

async function startRound(io, roundId) {
  const round = await getRound(roundId);

  if (round.state !== "ready") {
    return;
  }

  if (!round.activeRunId) {
    round.activeRunId = createRunId(roundId);
    round.startedAt = new Date().toISOString();
    await store.setRunContext(roundId, {
      runId: round.activeRunId,
      startedAt: round.startedAt
    });
  }

  round.state = "countdown";
  round.countdownEndsAt = new Date(Date.now() + ROUND_READY_COUNTDOWN_MS).toISOString();
  emitStatus(io, round);

  round.timer = setTimeout(() => {
    round.timer = null;
    round.countdownEndsAt = null;
    round.state = "running";
    emitStatus(io, round);
    schedule(io, round);
  }, ROUND_READY_COUNTDOWN_MS);
}

async function readyRound(io, roundId) {
  const round = await getRound(roundId);

  if (round.state === "idle") {
    round.countdownEndsAt = null;
    round.state = "ready";
    emitStatus(io, round);
  }
}

async function resetRound(io, roundId) {
  const previous = await getRound(roundId);
  if (previous.timer) {
    clearTimeout(previous.timer);
  }

  await store.clearRound(roundId);

  const next = {
    roundId,
    emitted: [],
    queue: buildPreInterruptQueue(roundId, [], previous.blueprint),
    state: "idle",
    timer: null,
    countdownEndsAt: null,
    selectedAction: null,
    activeRunId: null,
    startedAt: null,
    blueprint: previous.blueprint,
    engine: previous.engine
  };

  rounds.set(roundId, next);
  roundLoads.delete(roundId);

  emitToRoundSubscribers(io, roundId, (socket) => {
    emitSnapshot(socket, next);
  });
  emitStatus(io, next);
}

async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (requestUrl.pathname === "/health") {
      const round = await getRound(DEFAULT_ROUND_ID);
      const modelRouting = getRuntimeModelRoutingSummary();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          port: PORT,
          roundId: DEFAULT_ROUND_ID,
          engine: round.engine.kind,
          store: store.kind,
          llmTimeoutMs: LLM_TIMEOUT_MS,
          pacing: {
            tickMs: TICK_MS,
            readyCountdownMs: ROUND_READY_COUNTDOWN_MS,
            signalMs: ROUND_SIGNAL_MS,
            speechMinMs: ROUND_SPEECH_MIN_MS,
            speechMaxMs: ROUND_SPEECH_MAX_MS,
            speechCharsPerSec: ROUND_SPEECH_CHARS_PER_SEC
          },
          status: getStatus(round),
          modelRouting: {
            filePath: modelRouting.filePath,
            updatedAt: modelRouting.settings.updatedAt,
            routingDigest: modelRouting.routingDigest,
            providers: getProviderRuntimeSupport()
          }
        })
      );
      return;
    }

    const roundMatch = requestUrl.pathname.match(/^\/rounds\/([^/]+)$/);
    if (roundMatch) {
      const roundId = decodeURIComponent(roundMatch[1]);
      const round = await getRound(roundId);
      const modelRouting = getRuntimeModelRoutingSummary();

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          roundId,
          engine: round.engine.kind,
          store: store.kind,
          llmTimeoutMs: LLM_TIMEOUT_MS,
          pacing: {
            tickMs: TICK_MS,
            signalMs: ROUND_SIGNAL_MS,
            speechMinMs: ROUND_SPEECH_MIN_MS,
            speechMaxMs: ROUND_SPEECH_MAX_MS,
            speechCharsPerSec: ROUND_SPEECH_CHARS_PER_SEC
          },
          status: getStatus(round),
          events: round.emitted,
          modelRouting: {
            filePath: modelRouting.filePath,
            updatedAt: modelRouting.settings.updatedAt,
            routingDigest: modelRouting.routingDigest,
            providers: getProviderRuntimeSupport()
          }
        })
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "runtime_error",
        message: error.message
      })
    );
  }
}

const httpServer = createServer((req, res) => {
  void handleRequest(req, res);
});

const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.data.viewMode = "audience";
  socket.data.canModerate = false;

  socket.on("round:subscribe", ({ roundId, viewMode, operatorKey }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;
    let nextViewMode = sanitizeViewMode(viewMode);

    void (async () => {
      if (nextViewMode === "operator" && !hasOperatorAccess(operatorKey)) {
        nextViewMode = "audience";
        socket.emit("runtime:error", {
          message: "Invalid operator key. Subscribed as audience."
        });
      }

      if (typeof socket.data.roundId === "string" && socket.data.roundId !== targetRoundId) {
        socket.leave(roomName(socket.data.roundId));
      }

      socket.data.roundId = targetRoundId;
      socket.data.viewMode = nextViewMode;
      socket.data.canModerate =
        hasOperatorAccess(operatorKey) &&
        (nextViewMode === "operator" || nextViewMode === "tv");
      const round = await getRound(targetRoundId);
      socket.join(roomName(targetRoundId));
      emitSnapshot(socket, round);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });

  socket.on("round:start", ({ roundId }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;

    void (async () => {
      if (!canModerate(socket)) {
        socket.emit("runtime:error", {
          message: "Only operator-authorized clients can start rounds."
        });
        return;
      }

      const round = await getRound(targetRoundId);
      if (round.state !== "ready") {
        socket.emit("runtime:status", {
          ...getStatus(round, "socket", getSocketViewMode(socket)),
          canModerate: canModerate(socket)
        });
        return;
      }

      await startRound(io, targetRoundId);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });

  socket.on("round:ready", ({ roundId }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;

    void (async () => {
      if (!canPrepare(socket)) {
        socket.emit("runtime:error", {
          message: "Only operator clients can stage rounds."
        });
        return;
      }

      const round = await getRound(targetRoundId);
      if (round.state !== "idle") {
        socket.emit("runtime:status", {
          ...getStatus(round, "socket", getSocketViewMode(socket)),
          canModerate: canModerate(socket)
        });
        return;
      }

      await readyRound(io, targetRoundId);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });

  socket.on("round:go", ({ roundId }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;

    void (async () => {
      if (!canModerate(socket)) {
        socket.emit("runtime:error", {
          message: "Only operator-authorized clients can launch rounds."
        });
        return;
      }

      const round = await getRound(targetRoundId);
      if (round.state !== "ready") {
        socket.emit("runtime:status", {
          ...getStatus(round, "socket", getSocketViewMode(socket)),
          canModerate: canModerate(socket)
        });
        return;
      }

      await startRound(io, targetRoundId);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });

  socket.on("interrupt:resolve", ({ roundId, action }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;
    const targetAction = sanitizeAction(action);

    void (async () => {
      if (!canModerate(socket)) {
        socket.emit("runtime:error", {
          message: "Only operator clients can resolve interrupts."
        });
        return;
      }

      const round = await getRound(targetRoundId);

      if (round.state !== "waiting_for_interrupt") {
        socket.emit("runtime:status", {
          ...getStatus(round, "socket", getSocketViewMode(socket)),
          canModerate: canModerate(socket)
        });
        return;
      }

      round.selectedAction = targetAction;
      await store.setSelectedAction(targetRoundId, targetAction);
      round.queue = round.queue.concat(
        await round.engine.buildDecisionEvents({
          roundId: targetRoundId,
          action: targetAction,
          emittedEvents: round.emitted
        })
      );
      round.countdownEndsAt = null;
      round.state = "running";
      emitStatus(io, round);
      schedule(io, round);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });

  socket.on("round:reset", ({ roundId }) => {
    const targetRoundId =
      typeof roundId === "string" && roundId.length > 0 ? roundId : DEFAULT_ROUND_ID;

    void (async () => {
      if (!canModerate(socket)) {
        socket.emit("runtime:error", {
          message: "Only operator clients can reset rounds."
        });
        return;
      }

      await resetRound(io, targetRoundId);
    })().catch((error) => {
      socket.emit("runtime:error", { message: error.message });
    });
  });
});

async function shutdown(signal) {
  console.log(`[socket-runtime] shutting down on ${signal}`);

  for (const round of rounds.values()) {
    if (round.timer) {
      clearTimeout(round.timer);
    }
  }

  await Promise.all([
    new Promise((resolve) => io.close(() => resolve())),
    new Promise((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve()))
    ),
    store.close()
  ]).catch((error) => {
    console.error("[socket-runtime] shutdown error", error);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

httpServer.listen(PORT, () => {
  console.log(
    `socket-runtime listening on http://localhost:${PORT} (${RUNTIME_ENGINE} / ${store.kind})`
  );
});
